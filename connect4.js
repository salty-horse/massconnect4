var fs = require("fs");
var api_stuff = JSON.parse(fs.readFileSync("config.json", "utf8"));

var Twit = require("twit");
var T = new Twit({
	consumer_key: api_stuff.key,
	consumer_secret: api_stuff.secret,
	access_token: api_stuff.token,
	access_token_secret: api_stuff.token_secret
});

var wordfilter = require("wordfilter");

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

//whose turn it is
var to_play = "";
//game type, "random", "speed", or "vote"
var game_type = "";
//id of most recent bot tweet, as a cutoff for on-turn moves
var tweet_id = "";
//number containing current move
var current_move = 0;

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

//game setup like first tweet, mode selection, stream opening, etc goes here
function game_init() {
	//choose random player to start
	to_play = Math.floor(Math.random()*2) ? "sun" : "moon";
	//replace with randomly chosen game type when I add more
	game_type = "speed";

	//tweet game start
	T.post("statuses/update", {
		status: "Game Start\nMode: " + game_type.capitalize() + "\n\n" + draw_board() + "\n" + to_play.capitalize() + " to Play"},
		function(err, data, response) {
			tweet_id = data.id_str;
	});

	current_move++;
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

//given a tweet, figure out what move the player is saying
//returns a number 0-6, a usable aray index for column 1-7, or -1 on failure
//I think this is failure-proof, simply rejects anything that isn't an int 1-7 (0-6 after the -1 in move's assignment)
//anyway it's a lazy match that grabs the first int 1-7
function move_extract(the_tweet) {
	the_tweet = the_tweet.replace("@massconnect4 ","");
	return (the_tweet.match(/[1-7]+?/) || [0])[0] - 1;
}

//given an array of objects of the form {user: "username", move: [0-6]}, pick a winner and execute
//this will contain the logic for game modes later
//random: random value
//time: final value
//vote: figure out the most popular
//in future also must make sure move is valid
//think abt whether to silently pick another, or forfeit turn, on bad move
function do_move(the_tweets) {
	//for now, there are no modes
	//this is now 0-6
	//BIGBIGBIGBIGUGUGUIGIUG : it tweets the newest rather than oldest move?
	//MUCH BIGGER BUG: it crashes if there's no tweets
	var chosen_move, player;

	switch(game_type) {
		case "random":
		case "speed":
		case "vote":
	}

	chosen_move = the_tweets[the_tweets.length-1].move;
	player = the_tweets[the_tweets.length-1].user;
	if(wordfilter.blacklisted(player))
		player = "********";

	for(var j = 5; j > 0; j--) {
		if(board_array[chosen_move][j] === 0) {
			//put a sun or moon in chosen column on lowest free row
			board_array[chosen_move][j] = to_play;
			to_play = to_play === "sun" ? "moon" : "sun";
			break;
		}
	}

	//we have now updated the board_array, turn, and current player
	//in future, check for a win or draw now
	T.post("statuses/update", {
		status: "Move " + current_move + ": " + player + " Plays " + (chosen_move+1) + "\n\n" + draw_board() + "\n" + to_play.capitalize() + " to Play"},
		function(err, data, response) {
			tweet_id = data.id_str;
	});
	current_move++;
}

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
