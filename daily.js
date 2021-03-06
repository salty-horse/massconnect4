var fs = require("fs");
var Twit = require("twit");

var T = new Twit(require(__dirname + "/config.json"));
var T_A = new Twit(require(__dirname + "/config_A.json"));

var since_tho = "";

var players = JSON.parse(fs.readFileSync(__dirname + "/players.json", "utf8"));
T.get("statuses/user_timeline", { user_id: 3062270507, count: 5 }, function(err, data, response) {
	if(err) throw err;
	since_tho = data[0].id_str;

	T.get("statuses/mentions_timeline", { count: 200, since_id: since_tho }, function(err, data, response) {
		if(err) throw err;
		if(data) data.forEach(function(element) { try_add_player(element); });

		T_A.get("statuses/mentions_timeline", { count: 200, since_id: since_tho }, function(err, data, response) {
			if(err) throw err;
			if(data) data.forEach(function(element) { try_add_player(element); });

			fs.writeFile(__dirname + "/players.json", JSON.stringify(players,null,"\t"), "utf8", function(err) {
				if(err) throw err;
			});
		});
	});
});

function try_add_player(tweet) {
	//zzzzz
	if(tweet.user.screen_name == "massconnect4" || tweet.user.screen_name == "massconnect5") return;

	//init random so there's no bias if ppl tweet "sun moon" or whatever
	var teams = Math.floor(Math.random() * 2) ? ["sun","moon"] : ["moon","sun"];
	var words = (tweet.text).trim().toLowerCase().split(" ");
	var will_join = "";

	if(words.indexOf("random") > -1 || words.indexOf(teams[0]) > -1) will_join = teams[0];
	else if(words.indexOf(teams[1]) > -1) will_join = teams[1];
	else return;

	//we now know the person is trying to join a team and which team they want to join
	//now check if they are already on the players list
	if(players.hasOwnProperty(tweet.user.screen_name)) return;

	//they are not. add them to the list and follow them
	players[tweet.user.screen_name] = { team: will_join, stats: [{wins: 0, losses: 0, draws: 0, votes: 0}], joined: new Date() };
	T.post("friendships/create", {screen_name: tweet.user.screen_name}, function(err) { if(err) throw err; });
	T.post("lists/members/create", {slug: will_join + "-team", owner_id: 3062270507, screen_name: tweet.user.screen_name}, function(err) { if(err) throw err; });
}
