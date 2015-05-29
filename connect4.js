var fs = require("fs");
var Twit = require("twit");
var wordfilter = require("wordfilter");
var _ = require("underscore");

var T = new Twit(require(__dirname + "/config.json"));
var T_A = new Twit(require(__dirname + "/config_A.json"));

var players = JSON.parse(fs.readFileSync(__dirname + "/players.json", "utf8"));
var stats = JSON.parse(fs.readFileSync(__dirname + "/stats.json", "utf8"));

//some globals--this is the board, init to 0
//ZERO ZERO IS THE TOP LEFT CORNER!!!!!
//I hate doing it this way but otherwise looping in draw_board would be annoying
//valid values: 0, "sun", "moon"
var board_array = new Array(7);
for(var i = 0; i < board_array.length; i++) {
	board_array[i] = new Array(6);
	for(var j = 0; j < board_array[i].length; j++) {
		board_array[i][j] = 0;
	}
}

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

//whose turn it is, initialize on random player
var to_play = Math.floor(Math.random()*2) ? "sun" : "moon";
//game type, "random", "speed", or "vote"
var game_type = "vote";
//number containing current move, indexed from 1 for easier printing
var current_move = 1;
//object holding every move that has been tweeted in the current round
var tweeted_moves = {};
//array holding a list of this game's participating players
var participants = [];
//array index for stat stuff, bc stats[stats.season] is possibly confusing
var season = stats.season;
//increment on interval with no votes, clear on do_move, kill game after x minutes of no plays
var timeout = 0;
//ugh
var tweet_to_post = {};

//!\\ ATTN
//I have to write another js file that checks the tweet backlog and adds players to teams
//Maybe daily, one script that adds players to teams and tweets the latest stats
//so it should have a function that takes a tweet's text and checks
//* if someone is trying to join a team
//* if yes, if they're already on a team
//* if no, add them to the team they want or random
//--players.json--
//{ alicemazzy: { team: moon, stats: [{win: 3, lose: 2, draw: 1},{win: 5, lose: 2, draw: 3}], joined: date }, markymark: { //etc } }
//in future break stats down into "seasons"
//--stats.json--
//worry abt this later, call beta test period the "preseason"
//--
//then the daily script runs that function over all the past day's tweets
//while the stream can run it over every tweet received
var stream = T.stream("user");

console.log("game_type: " + game_type + "\nto_play: " + to_play);
tweet_to_post = { status: "Preseason Game "+(+stats.games+1)+"\nMode: " + game_type.capitalize() + "\n\n" + draw_board(true) + "\n" + to_play.capitalize() + " to Play"};
T_A.post("statuses/update", tweet_to_post, function(err, data, response) { if(err) throw err; });
tweet_to_post = { status: "Preseason Game "+(+stats.games+1)+"\nMode: " + game_type.capitalize() + "\n\n" + draw_board(false) + "\n" + to_play.capitalize() + " to Play"};
T.post("statuses/update", tweet_to_post, function(err, data, response) { if(err) throw err; });

stream.on("tweet", function(tweet) {
	//exit immediately if not a mention or if a RT
	if(tweet.text.indexOf("@massconnect") == -1 || tweet.text.indexOf("RT ") > -1) return;
	//also if from the other bot
	if(tweet.user.screen_name == "massconnect4" || tweet.user.screen_name == "massconnect5") return;
	
	//if they're on the player list
	if(players.hasOwnProperty(tweet.user.screen_name)) {
		//and current team
		if(players[tweet.user.screen_name].team == to_play) {
			//try adding their move if they're making one
			try_add_move(tweet);
		}
	}
	//but if they're not on a team, maybe they want to join one
	else if(try_add_player(tweet));
	//but if they're just a rando trying to play without reading how it works, add them to the current team if they're tweeting a move
	else if(try_add_move(tweet) !== undefined) try_add_player(tweet, to_play);
});

//un-hardcode the time values later imo
var interv = setInterval(function() {
	if(Object.getOwnPropertyNames(tweeted_moves).length > 0) {
		timeout = 0;
		do_move();
	} else timeout+=3;
	if(timeout == 15) {
		tweet_to_post = { status: "No votes received for 15 minutes\n\n" + draw_board(true) + "\nGame will end unless players join" };
		T_A.post("statuses/update", tweet_to_post, function(err, data, response) { if(err) throw err; });
		tweet_to_post = { status: "No votes received for 15 minutes\n\n" + draw_board(false) + "\nGame will end unless players join" };
		T.post("statuses/update", tweet_to_post, function(err, data, response) { if(err) throw err; });
	}
	if(timeout >= 20) {
		tweet_to_post = { status: "No votes received for "+timeout+" minutes\n\n" + draw_board(true) + "\nPreseason Game "+(+stats.games+1)+": Null Game" };
		T_A.post("statuses/update", tweet_to_post, function(err, data, response) { if(err) throw err; });
		tweet_to_post = { status: "No votes received for "+timeout+" minutes\n\n" + draw_board(false) + "\nPreseason Game "+(+stats.games+1)+": Null Game" };
		T.post("statuses/update", tweet_to_post,
			function(err, data, response) {
				if(err) throw err;
				//clear interval, update stats, etc
				stats.games++;
				stats.dead_games++;

				fs.writeFile(__dirname + "/players.json", JSON.stringify(players,null,"\t"), "utf8", function(err) {
					if(err) throw err;
				});
				fs.writeFile(__dirname + "/stats.json", JSON.stringify(stats,null,"\t"), "utf8", function(err) {
					if(err) throw err;
				});

				clearInterval(interv);
				stream.stop();
		});
	}
},60*1000*3);

//adds player to team and returns team name on success
function try_add_player(tweet, team) {
	//init random so there's no bias if ppl tweet "sun moon" or whatever
	var teams = Math.floor(Math.random() * 2) ? ["sun","moon"] : ["moon","sun"];
	var words = (tweet.text).trim().toLowerCase().split(" ");
	var will_join;

	if(team) will_join = team;
	else if(words.indexOf("random") > -1 || words.indexOf(teams[0]) > -1) will_join = teams[0];
	else if(words.indexOf(teams[1]) > -1) will_join = teams[1];
	else return;

	//this check is done before calling
	//if(players.hasOwnProperty(tweet.user.screen_name)) return;

	//add them to the list and follow them
	players[tweet.user.screen_name] = { team: will_join, stats: [{wins: 0, losses: 0, draws: 0, votes: 0}], joined: new Date() };
	T.post("friendships/create", {screen_name: tweet.user.screen_name}, function(err) { if(err) throw err; });
	T.post("lists/members/create", {slug: will_join + "-team", owner_id: 3062270507, screen_name: tweet.user.screen_name}, function(err) { if(err) throw err; });
	fs.writeFile(__dirname + "/players.json", JSON.stringify(players,null,"\t"), "utf8", function(err) { if(err) throw err;});

	return will_join;
}

//returns a string of newlined emoji repping the board plus column nums	
function draw_board(android) {
	var board_img = "";
	var board_txt = "";
	var blank = android ? "\uD83C\uDF46" : "\u2B1C";

	//sub w forEach later
	for(var j = 0; j < 6; j++) {
		for(var i = 0; i < 7; i++) {
			switch(board_array[i][j]) {
				case 0:
					//blank
					board_img += blank;
					board_txt += "O";
					break;
				case "sun":
					//sun - 1f31e in normal unicode
					board_img += "\uD83C\uDF1E";
					board_txt += "S";
					break;
				case "moon":
					//moon - 1f31a in normal unicode
					board_img += "\uD83C\uDF1A";
					board_txt += "M";
					break;
			}
		}
		//newline after each row
		board_img += "\n";
		board_txt += "\n";
	}

	//out of loops, we now have a string of emoji for the board
	//just gotta add the column numbers...
//	if(android)
//		board_img += "\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\n";
//	else
		board_img += "\u0031\u20E3\u0032\u20E3\u0033\u20E3\u0034\u20E3\u0035\u20E3\u0036\u20E3\u0037\u20E3\n";
	board_txt += "1234567\n";

	//aaand tada, we're done!
	console.log(board_txt);
	return(board_img);
}

//I am so tired of team == "sun" ? "moon" : "sun" nonsense
function flip() {
	return to_play == "sun" ? "moon" : "sun";
}

//given a tweet, figure out what move the player is saying, and adds to tweeted_moves if column is free
//in other words, this assumes you already checked if the player is on the relevant team, but nothing more
//idea: in the future I could easily add a "chaos" mode that takes moves from anyone
//it would be *really* interesting if ppl played optimally on their team and poorly on the other
function try_add_move(tweet) {
	var match = tweet.text.replace(/@[A-Za-z0-9]*/g,"").match(/[1-7]/);
	//if there's a hit and the column is free, add the move to the list
	//subtract 1 so other functions can use the tweeted moves as array indexes directly
	//returns the move if a move was made, which other fns can use to check success/fail or other things
	//be careful, 0 is a possible success (and failure is undefined), so checks on this must not coerce type
	if(match && board_array[match[0]-1][0] === 0) {
		tweeted_moves[tweet.user.screen_name] = match[0]-1;
		T.post("favorites/create", { id: tweet.id_str }, function(err, data, response) { if(err) throw err; });
		return match[0]-1;
	}
}

//updated to operate on tweeted_moves, obj of the form { alicemazzy:6, jilljo: 4, etc}
//contains all validated, team-appropriate moves, wipe it when finished
//this will contain the logic for game modes later
//random: random value
//time: final value
//vote: figure out the most popular
function do_move() {
	console.log("DO_MOVE:\n" + JSON.stringify(tweeted_moves));
	switch(game_type) {
		case "random":
		case "speed":
		case "vote":
			//counts up votes per column
			//!\\ preseason who cares but tweak this later
			//I want to hold votes in escrow and only add after the game is done, dead games shouldn't count
			//also do fancier thngs, like track if X player voted for the move that was chosen
			//give awards to players mb per-game, per-week, per-season... ideas:
			//MVP might be "player on the winning team who most often voted for the move that was chosen"
			//can also give awards for most games played, most avg votes per game, most wins, best win %, etc
			for(var key in tweeted_moves) {
				//in theory this is extraneous, participants and team votes can derive from a hashmap of all previous tweeted_moves objects
				//I can use immutable for that, also for board array to allow full match history
				if(participants.indexOf(key) == -1) participants.push(key);
				players[key].stats[season].votes++;
				stats[to_play][season].votes++;
			}

			var final_move = _.chain(tweeted_moves).countBy().pairs().shuffle().max(_.last).head().value();
			break;
	}

//	if(wordfilter.blacklisted(player))
//		player = "********";
	var final_j;

	for(var j = 5; j >= 0; j--) {
		if(board_array[final_move][j] === 0) {
			//put a sun or moon in chosen column on lowest free row
			board_array[final_move][j] = to_play;
			final_j = j;
			break;
		}
	}
	if(check_win(final_move, final_j)) {
		tweet_to_post = { status: "Move "+current_move+": "+to_play.capitalize()+" Plays "+ (+final_move+1)+"\n\n"+draw_board(true)+"\nPreseason Game "+(+stats.games+1)+": "+to_play.capitalize()+" Wins!!"};
		T_A.post("statuses/update", tweet_to_post, function(err, data, response) { if(err) throw err; });
		tweet_to_post = { status: "Move "+current_move+": "+to_play.capitalize()+" Plays "+ (+final_move+1)+"\n\n"+draw_board(false)+"\nPreseason Game "+(+stats.games+1)+": "+to_play.capitalize()+" Wins!!"};
		T.post("statuses/update", tweet_to_post,
			function(err, data, response) {
				if(err) throw err;
				//clear interval, update stats, etc
				participants.forEach(function(element) {
					players[element].team == to_play ?
						players[element].stats[season].wins++ :
						players[element].stats[season].losses++;
				});
				stats[to_play][season].wins++;
				stats[flip()][season].losses++;
				stats.games++;

				fs.writeFile(__dirname + "/players.json", JSON.stringify(players,null,"\t"), "utf8", function(err) {
					if(err) throw err;
				});
				fs.writeFile(__dirname + "/stats.json", JSON.stringify(stats,null,"\t"), "utf8", function(err) {
					if(err) throw err;
				});

				clearInterval(interv);
				stream.stop();
			});
	} else if(check_draw()) {
		tweet_to_post = { status: "Move " + current_move + ": " + to_play.capitalize() + " Plays " + (+final_move+1) + "\n\n" + draw_board(true) + "\nPreseason Game "+(+stats.games+1)+": Draw Game"};
		T_A.post("statuses/update", tweet_to_post, function(err, data, response) { if(err) throw err; });
		tweet_to_post = { status: "Move " + current_move + ": " + to_play.capitalize() + " Plays " + (+final_move+1) + "\n\n" + draw_board(false) + "\nPreseason Game "+(+stats.games+1)+": Draw Game"};
		T.post("statuses/update", tweet_to_post,
			function(err, data, response) {
				if(err) throw err;
				//clear interval, update stats, etc
				participants.forEach(function(element) {
					players[element].stats[season].draws++;
				});
				stats[to_play][season].draws++;
				stats[flip()][season].draws++;
				stats.games++;

				fs.writeFile(__dirname + "/players.json", JSON.stringify(players,null,"\t"), "utf8", function(err) {
					if(err) throw err;
				});
				fs.writeFile(__dirname + "/stats.json", JSON.stringify(stats,null,"\t"), "utf8", function(err) {
					if(err) throw err;
				});

				clearInterval(interv);
				stream.stop();
			});
	} else {
		tweet_to_post = { status: "Move " + current_move + ": " + to_play.capitalize() + " Plays " + (+final_move+1) + "\n\n" + draw_board(true) + "\n" + flip().capitalize() + "'s Turn" };
		T_A.post("statuses/update", tweet_to_post, function(err, data, response) { if(err) throw err; });
		tweet_to_post = { status: "Move " + current_move + ": " + to_play.capitalize() + " Plays " + (+final_move+1) + "\n\n" + draw_board(false) + "\n" + flip().capitalize() + "'s Turn" };
		T.post("statuses/update", tweet_to_post,
			function(err, data, response) {
				if(err) throw err;
				to_play = flip(); 
				current_move++;
				tweeted_moves = {};
		});
	}
}

//given the played position just check if it's part of a win
//way simpler than checking the entire board
function check_win(x, y) {
	var this_player = board_array[x][y];

	//column, top->bottom
	for(var j = 0, count = 0; j < 6; j++) {
		if(board_array[x][j] == this_player) count++; else count = 0;
		if(count == 4) return true;
	}
	count=0;

	//row, left->right
	for(var i = 0; i < 7; i++) {
		if(board_array[i][y] == this_player) count++; else count = 0;
		if(count == 4) return true;
	}
	count=0;

	//diag down+right
	var n = x, m = y;
	while(n > 0 && m > 0) { n--; m--; }

	for(; n < 7 && m < 6; n++, m++) {
		if(board_array[n][m] == this_player) count++; else count = 0;
		if(count == 4) return true;
	}
	count=0;

	//diag down+left
	n = x, m = y;
	while(n < 6 && m > 0) { n++; m--; }

	for(; n >= 0 && m < 6; n--, m++) {
		if(board_array[n][m] == this_player) count++; else count = 0;
		if(count == 4) return true;
	}

	return false;
}

//come up with a better implementation later
//currently this doesn't draw until the board is full
//a better function would check if a win is impossible on a non-full board
//possibly "if all empty spaces were filled by either team would neither win"
//an even better function would be able to take into account the fact that each team *must* play and be able to determine draw even earlier
function check_draw() {
	return (board_array.reduce(function(a,b){return a.concat(b);}).indexOf(0) == -1);
}
