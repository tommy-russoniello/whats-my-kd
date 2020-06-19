API_URL = "https://api.tracker.gg/api"
CORS_PROXY_URL = "https://cors-anywhere.herokuapp.com"
MATCHES_PATH = "v1/modern-warfare/matches"
PROFILE_PATH = "v2/modern-warfare/standard/profile"
FULL_STATS_URL_PREFIX = "https://cod.tracker.gg/modern-warfare/profile"

window.onload = function() {
	var kills;
	var deaths;
	var now;
	var start;

	var urlParams = new URLSearchParams(window.location.search);
	var player = urlParams.get("id");
	var platform = urlParams.get("platform");
	$(".search").hide();
	$(".display").hide();
	$("#error").hide();
	if(player && platform) {
		process();
	} else {
		$("#loader").hide();
		$(".search").show();
	}

	function displayError(errorMessage) {
		$(".search").show();
		$(".display").hide();
		$("#loader").hide();
		$("#error").html(errorMessage);
		$("#error").show();
	}

	function displayData() {
		if (deaths == 0) {
			var deaths_for_ratio = 1;
		} else {
			var deaths_for_ratio = deaths;
		}

		ratio = (kills / deaths_for_ratio).toPrecision(4);
		$("#loader").hide();
		$(".display").show();
		$("#message").html(`${kills} kills / ${deaths} deaths = ${ratio} KD`);

		if(deaths > 1) {
			if(ratio < 0.5) {
				$("#comment").html("You suck, bruh.");
			} else if (ratio < 0.9) {
				$("#comment").html("Ehhh...");
			} else if (ratio < 1.1) {
				$("#comment").html("Not too shabby.");
			} else if (ratio < 1.75) {
				$("#comment").html("Noice.");
			} else {
				$("#comment").html("Damn, son.");
			}
		}
	}

	function getData(next) {
		$.getJSON(
			`${CORS_PROXY_URL}/${API_URL}/${MATCHES_PATH}/${platform}/${encodeURI(player)}?type=mp&next=${next}`
		)
			.done(function(data) { setData(data); })
			.fail(function(data) { displayError("Player not found"); });
	}

	function process() {
		$("#name").html(player);
		kills = 0;
		deaths = 0;
		now = new Date();
		if(now.getHours() > 5) {
			start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6);
		} else {
			start = new Date(now.getTime());
			start.setDate(start.getDate() - 1);
			start.setHours(6);
		}

		$.getJSON(`${CORS_PROXY_URL}/${API_URL}/${PROFILE_PATH}/${platform}/${encodeURI(player)}`)
			.done(function(data) {
				$("#platform-icon").attr("src", `images/${platform}.png`);
				$(".search").hide()
				$("#name").html(data.data.platformInfo.platformUserHandle);
				getData("null");
			})
			.fail(function(data) {
				displayError("Player not found");
			});
	}

	function setData(data) {
		var matches = data.data.matches;
		var i = 0;
		for(; i < matches.length; i++) {
			var matchData = matches[i];
			if(new Date(matchData.metadata.timestamp) < start) break;

			var stats = matchData.segments[0].stats;
			kills += stats.kills.value;
			deaths += stats.deaths.value;
		}

		if(i == matches.length) {
			getData(data.data.metadata.next);
		} else {
			displayData();
		}
	}

	$("#username").on("keyup", function() {
    if(event.key !== "Enter") return;

    $("#search").click();
    event.preventDefault();
	});

	$(document).on("click", "#search", function() {
		$("#error").hide();
		$("#loader").show();
		var searchParams = new URLSearchParams();
		var temp_id = $("#username").val()
		if(temp_id == null || temp_id == "") {
			displayError("Enter a username.");
			return;
		}
		searchParams.set("id", temp_id);
		var temp_platform = $("input[name=platform]:checked").val()
		if(temp_platform == null || temp_platform == "") {
			displayError("Select a platform.");
			return;
		}
		searchParams.set("platform", temp_platform);
		window.location.search = searchParams.toString();
		process();
	});

	$(document).on("click", "#full-stats", function() {
		window.location = `${FULL_STATS_URL_PREFIX}/${platform}/${player}/mp`;
	});

	$(document).on("click", "#back", function() {
		window.location.search = "";
	});
}
