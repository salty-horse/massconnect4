//!\\ HOLY SHIT WIP //!\\
//game_init() is gone
//do_move() needs to be changed to work with tweeted_moves, vote logic set up, do its own safety checking mb
//setInterval it on its own
//game_time() is garbage pending deletion
//add win logic and player win/participation stats
var fs = require("fs");
var Twit = require("twit");
var wordfilter = require("wordfilter");

var api = JSON.parse(fs.readFileSync(__dirname + "/config.json", "utf8"));

var T = new Twit({
	consumer_key: api.key,
	consumer_secret: api.secret,
	access_token: api.token,
	access_token_secret: api.token_secret
});

var players = JSON.parse(fs.readFileSync(__dirname + "/players.json", "utf8"));

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
//id of most recent bot tweet, as a cutoff for on-turn moves
var tweet_id = "";
//number containing current move, indexed from 1 for easier printing
var current_move = 1;
//object holding every move that has been tweeted in the current round
var tweeted_moves = {};

//!\\ ATTN
//I have to write another js file that checks the tweet backlog and adds players to teams
//Maybe daily, one script that adds players to teams and tweets the latest stats
//so it should have a function that takes a tweet's text and checks
//* if someone is trying to join a team
//* if yes, if they're already on a team
//* if no, add them to the team they want or random
//--players.json--
//{ alicemazzy: { team: moon, played: 5, wins: 3, joined: date }, markymark: { //etc } }
//in future break stats down into "seasons"
//--stats.json--
//worry abt this later, call beta test period the "preseason"
//--
//then the daily script runs that function over all the past day's tweets
//while the stream can run it over every tweet received
var stream = T.stream("user");

T.post("statuses/update", {
	status: Math.floor(Math.random()*100) + " Test Start\nMode: " + game_type.capitalize() + "\n\n" + draw_board() + "\n" + to_play.capitalize() + " to Play"},
	function(err, data, response) {
		if(err) throw err;
		tweet_id = data.id_str;
});

stream.on("tweet", function(tweet) {
	//exit immediately if not a mention
	if((tweet.text).indexOf("@massconnect4") == -1) return;

//	var words = (tweet.text).trim().toLowerCase().split(" ");
	
	//if they're on the player list
	if(players.hasOwnProperty(tweet.user.screen_name)) {
		//and current team
		if(players[tweet.user.screen_name].team == to_play) {
			//grab either a valid move or undefined
			var their_move = move_extract(tweet);
			//if there's a valid move, add/replace their slot in the moves object
			if(their_move !== undefined && board_array[their_move][0] === 0) tweeted_moves[tweet.user.screen_name] = their_move;
		}
	}
	//but if they're not on a team, maybe they want to join one
	else try_add_player(tweet);
});

var interv = setInterval(function() { if(Object.getOwnPropertyNames(tweeted_moves).length > 0) do_move(); },60*1000/2);

function try_add_player(tweet) {
	//init random so there's no bias if ppl tweet "sun moon" or whatever
	var teams = Math.floor(Math.random() * 2) ? ["sun","moon"] : ["moon","sun"];
	var words = (tweet.text).trim().toLowerCase().split(" ");
	var will_join = "";

	if(words.indexOf("random") > -1 || words.indexOf(teams[0]) > -1) will_join = teams[0];
	else if(words.indexOf(teams[1]) > -1) will_join = teams[1];
	else return;

	//this check is done before calling
	//if(players.hasOwnProperty(tweet.user.screen_name)) return;

	//add them to the list and follow them
	players[tweet.user.screen_name] = { team: will_join, played: 0, wins: 0, joined: new Date() };
	T.post("friendships/create", {screen_name: tweet.user.screen_name}, function(err) { if(err) throw err; });
	fs.writeFile(__dirname + "/players.json", JSON.stringify(players), "utf8", function(err) {
		if(err) throw err;
	});
}

//returns a string of newlined emoji repping the board plus column nums	
function draw_board() {
	var board_img = "";

	//sub w forEach later
	for(var j = 0; j < 6; j++) {
		for(var i = 0; i < 7; i++) {
			switch(board_array[i][j]) {
				case 0:
					//blank
					board_img += "\u2B1C";
					break;
				case "sun":
					//sun - 1f31e in normal unicode
					board_img += "\uD83C\uDF1E";
					break;
				case "moon":
					//moon - 1f31a in normal unicode
					board_img += "\uD83C\uDF1A";
					break;
			}
		}
		//newline after each row
		board_img += "\n";
	}

	//out of loops, we now have a string of emoji for the board
	//just gotta add the column numbers...
	board_img += "\u0031\u20E3\u0032\u20E3\u0033\u20E3\u0034\u20E3\u0035\u20E3\u0036\u20E3\u0037\u20E3\n";

	//aaand tada, we're done!
	console.log(board_img);
	return(board_img);
}

//I am so tired of team == "sun" ? "moon" : "sun" nonsense
function flip() {
	return to_play == "sun" ? "moon" : "sun";
}

//given a tweet, figure out what move the player is saying
//returns a number 0-6, a usable aray index for column 1-7, or -1 on failure
//I think this is failure-proof, simply rejects anything that isn't an int 1-7 (0-6 after the -1 in move's assignment)
//anyway it's a lazy match that grabs the first int 1-7
//!\\ ATTN
//this used to return -1 on no match, not all calls to this have been fixed to account for this change
function move_extract(tweet) {
	tweet = (tweet.text).replace("@massconnect4 ","");
	match = tweet.match(/[1-7]+?/);
	if(match) return match[0] - 1; else return undefined;
}

//updated to operate on tweeted_moves, obj of the form { alicemazzy:6, jilljo: 4, etc}
//contains all validated, team-appropriate moves, wipe it when finished
//this will contain the logic for game modes later
//random: random value
//time: final value
//vote: figure out the most popular
//in future also must make sure move is valid
//think abt whether to silently pick another, or forfeit turn, on bad move
function do_move() {
	//for now, there are no modes
	//this is now 0-6
	//BIGBIGBIGBIGUGUGUIGIUG : it tweets the newest rather than oldest move?
	//MUCH BIGGER BUG: it crashes if there's no tweets

	console.log("DO_MOVE:\n" + JSON.stringify(tweeted_moves));
	switch(game_type) {
		case "random":
		case "speed":
		case "vote":
			//counts up votes per column
			var vote_counter = [0,0,0,0,0,0,0];
			for(var key in tweeted_moves) vote_counter[tweeted_moves[key]]++;
			//finds what the largest # of votes is
			var most_votes = Math.max.apply(Math, vote_counter);
			//collect all the indexes aka column numbers that hit that #
//			var winning_moves = [];
//			for(var i in vote_counter) if(vote_counter[i] == most_votes) winning_moves.push(i);
			//!\\ fancy this up a bit later
			//for now, if there's a tie Math.random settles it
//			var final_move = winning_moves[Math.floor(Math.random() * winning_moves.length - 1)];
			var final_move = parseInt(vote_counter.indexOf(Math.max.apply(Math, vote_counter)));
//			console.log("vote_counter: " + JSON.stringify(vote_counter) +
//				    "\nmost_votes: " + most_votes +
//				    "\nwinning_moves: " + JSON.stringify(winning_moves) +
//				    "\nfinal_move: " + final_move);
			break;
	}

//	if(wordfilter.blacklisted(player))
//		player = "********";
	var final_j;

	for(var j = 5; j > 0; j--) {
		if(board_array[final_move][j] === 0) {
			//put a sun or moon in chosen column on lowest free row
			board_array[final_move][j] = to_play;
			final_j = j;
			break;
		}
	}
	if(check_win(final_move, final_j)) {
		T.post("statuses/update", {
			status: "Move " + current_move + ": " + to_play.capitalize() + " Plays " +
				(+final_move+1) + "\n\n" + draw_board() + "\n" + to_play.capitalize() + " Wins!!"},
			function(err, data, response) {
				if(err) throw err;
				//clear interval, update stats, etc
				clearInterval(interv);
				stream.close();
			});
	} else {
		T.post("statuses/update", {
			status: "Move " + current_move + ": " + to_play.capitalize() + " Plays " + 
				(+final_move+1) + "\n\n" + draw_board() + "\n" + flip().capitalize() + "'s Turn" },
			function(err, data, response) {
				if(err) throw err;
				tweet_id = data.id_str;
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

	//row, left->right
	for(var i = 0; i < 7; i++) {
		if(board_array[i][y] == this_player) count++; else count = 0;
		if(count == 4) return true;
	}

	//diag down+right
	var n = x, m = y;
	while(n > 0 && m > 0) { n--; m--; }

	for(n, m; n < 7 && m < 6; n++, m++) {
		if(board_array[n][m] == this_player) count++; else count = 0;
		if(count == 4) return true;
	}

	//diag down+left
	n = x, m = y;
	while(n < 6 && m > 0) { n++; m--; }

	for(n, m; n > 0 && m < 6; n--, m++) {
		if(board_array[n][m] == this_player) count++; else count = 0;
		if(count == 4) return true;
	}

	return false;
}

/*
//main function where shit happens
function game_time() {
	//init, obv
	game_init();

	//this block runs every 2 minutes
	setInterval(function() {
		//get 200 most recent statuses since last tweet
		T.get("statuses/mentions_timeline", { count: 200, since_id: tweet_id }, function(err, data, response) {
			if(typeof data !== undefined) {
				//this who function is garbage
				//I should have a forEach, use obj of the form {alicemazzy:5, maliceazzy:2, ... etc }
				//and just check if the entry exists rather than this filter nonsense
				//HOWEVER
				//game_time() itself needs to be totally revamped
				//I want to use the streaming api, keep a buffer 
				var tweets = [];
				for(var i = 0; i < data.length; i++) {
					if(tweets.filter(function(element) { if(element.user === data[i].user.screen_name) return true; else return false;}).length === 0) {
						tweets.push({ user: data[i].user.screen_name, move: move_extract(data[i].text)});
						console.log("user: " + tweets[tweets.length-1].user + "\nmove: " + tweets[tweets.length-1].move);
					}
				}

				if(tweets.length > 0)
					do_move(tweets);
			}
		});
	},120000);
}

game_time();

/* Anyway, todo...
 *
 * need to check for win condition obv, decided just scanning each row/col/diag is prolly fastest/easiet
 * checking for draw is harder... I guess I could just do like "assuming every unfilled spot was x/y player would they win?"
 * that is an incredibly naive way to check and games wouldn't draw until the board was nearly full... zzz.
 *
 * need to be able to handle no tweets, malformed tweets, etc. I like the idea of forfeiting a turn for a malformed tweet.
 * incentivizes being a proper player in a way that sweeping it under the rug doesn't. 
 *
 * need to split into teams and read/write team lists... prolly do this sooner rather than later, it affects the program flow a lot
 * removal from team can wait...
 *
 * maybe just implement vote mode and do the others later. vote mode is by far the most interesting, emphasizing teamwork.
 *
 * prolly in a different file that runs on a different sched but
 * mb tweet leaderboards or whatever daily, def keep track of wins by team, goal is to encourage 
 *
 * I think that's it for now
 */
