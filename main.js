API_URL = "https://api.tracker.gg/api"
CORS_PROXY_URL = "https://whats-my-kd-cors-proxy.herokuapp.com"
MATCHES_PATH = "v1/modern-warfare/matches"
PROFILE_PATH = "v2/modern-warfare/standard/profile"
FULL_STATS_URL_PREFIX = "https://cod.tracker.gg/modern-warfare/profile"

var darkMode = false;

window.addEventListener('DOMContentLoaded', function() {
  if(Cookies.get("dark-mode") === "true") {
    window.toggleDarkMode();
  }
});

window.onload = function() {
  if(darkMode) {
    $("#dark-mode-toggle").attr("checked", "checked");
  }

	$("#footer").html(generateFooterMessage());

	var wins = 0;
	var losses = 0;
	var kills = 0;
	var deaths = 0;
	var timePlayed = 0;
	var now;
	var start;

	var urlParams = new URLSearchParams(window.location.search);
	var player = urlParams.get("id");
  var encodedPlayer = encodeURIComponent(player);
	var platform = urlParams.get("platform");
	if(player && platform) {
		process();
	} else {
		$("#loader").hide();
		$(".search").show();
	}

  function CheckResponseErrorMessage(data, message) {
    return data && data.responseJSON && data.responseJSON.errors && data.responseJSON.errors[0] &&
      data.responseJSON.errors[0].message === message;
  }

	function displayError(errorMessage) {
		$(".search").show();
		$(".display").hide();
		$("#loader").hide();
		$("#error").html(errorMessage);
		$("#error").show();
	}

	function displayData() {
		$("#loader").hide();
		$(".display").show();

		if (deaths === 0) {
			deaths_for_ratio = 1;
		} else {
			deaths_for_ratio = deaths;
		}
		kd_ratio = (kills / deaths_for_ratio).toPrecision(4);
    kills_string = pluralityString(kills, 'kill', 'kills');
    deaths_string = pluralityString(deaths, 'death', 'deaths');
		$("#kd").html(`${kills_string} / ${deaths_string} = ${kd_ratio} KD`);

		if(losses === 0) {
			losses_for_ratio = 1;
		} else {
			losses_for_ratio = losses;
		}
		wl_ratio = (wins / losses_for_ratio).toPrecision(4);
    wins_string = pluralityString(wins, 'win', 'wins');
    losses_string = pluralityString(losses, 'loss', 'losses');
		$("#wl").html(`${wins_string} / ${losses_string} = ${wl_ratio} WL`);

    hours = Math.floor(timePlayed / (60 * 60));
    minutes = Math.floor(timePlayed / 60 % 60);
    seconds = timePlayed % 60;

    hours_string = pluralityString(hours, 'hour', 'hours');
		minutes_string = pluralityString(minutes, 'minute', 'minutes');
		seconds_string = pluralityString(seconds, 'second', 'seconds');
		$("#time-played").html(`${hours_string}, ${minutes_string}, and ${seconds_string} played`);

		if(deaths > 0 || kills > 0) {
			if(kd_ratio < 0.5) {
				$("#comment").html("You kinda suck today, bruh.");
			} else if (kd_ratio < 0.8) {
				$("#comment").html("Ehhh...");
			} else if (kd_ratio < 0.95) {
				$("#comment").html("Not so hot.");
			} else if (kd_ratio < 1.15) {
				$("#comment").html("Not too shabby.");
			} else if (kd_ratio < 1.5) {
				$("#comment").html("Noice.");
			} else if (kd_ratio < 2) {
				$("#comment").html("Hey, that's pretty good.");
      } else if (kd_ratio < 3) {
        $("#comment").html("Damn, son.");
			} else {
				$("#comment").html("You're cracked, bro");
			}
		}
	}

	function generateFooterMessage() {
		return FOOTER_MESSAGES[Math.floor(Math.random() * FOOTER_MESSAGES.length)]
	}

	function getData(next) {
		$.getJSON(
			`${CORS_PROXY_URL}/${API_URL}/${MATCHES_PATH}/${platform}/${encodedPlayer}?type=mp&next=${next}`
		)
			.done(function(data) { setData(data); })
			.fail(function(data) {
				if(data === null) {
					displayError("The Tracker Network failed to respond.");
				} else if(CheckResponseErrorMessage(data, "Unable to retrieve match data at this time.")) {
          displayError("The Call of Duty API failed to respond.");
        } else {
					displayError("Failed to retrieve match data.");
				}
			});
	}

  function pluralityString(number, singularWord, pluralWord) {
    string = `${number} `;
		if(number === 1) {
			string += singularWord;
		} else {
      string += pluralWord;
    }

    return string;
  }

	function process() {
		$("#name").html(player);
		full_stats_url = `${FULL_STATS_URL_PREFIX}/${platform}/${encodedPlayer}/mp`
		$("#name").attr("href", full_stats_url);
		$("#avatar-anchor").attr("href", full_stats_url);
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

		$("#date").html(prettyDateString(start));
		$.getJSON(
      `${CORS_PROXY_URL}/${API_URL}/${PROFILE_PATH}/${platform}/${encodedPlayer}`
    )
			.done(function(data) {
				$(".search").hide();
				$("#platform-icon").attr("src", `images/${platform}.png`);
				$("#name").html(data.data.platformInfo.platformUserHandle);
				avatarUrl = data.data.platformInfo.avatarUrl
				if(avatarUrl == null || avatarUrl == "") {
					avatarUrl = "images/default_avatar.png"
				}
				$("#avatar").attr("src", avatarUrl);

				getData("null");
			})
			.fail(function(data) {
				if(data === null) {
					displayError("The Tracker Network failed to respond.");
        } else if(CheckResponseErrorMessage(data, "This profile is private.")) {
          displayError("Player profile is private.");
				} else {
					displayError("Player not found: profile is private or name is incorrect.");
				}
			});
	}

	function setData(data) {
		if(!("data" in data) || !("matches" in data.data)) {
			displayError("The Tracker Network failed to retrieve the data.");
		}

		matches = data.data.matches;
		i = 0;
		for(; i < matches.length; i++) {
			var matchData = matches[i];
			if(new Date(matchData.metadata.timestamp) < start) break;

			if(matchData.segments[0].metadata.hasWon) {
				wins += 1
			} else {
				losses += 1
			}

			stats = matchData.segments[0].stats;
			kills += stats.kills.value;
			deaths += stats.deaths.value;

			timePlayed += stats.timePlayed.value;
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
		$(".search").hide()
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

    if(temp_platform == "battlenet" && !/^.+#.*$/.test(temp_id)) {
			displayError("Must include number for Battlenet usernames. For example, \"CaptainPrice#1911\".");
			return;
		}

		searchParams.set("platform", temp_platform);
		window.location.search = searchParams.toString();

		try {
			process();
		} catch(error) {
			displayError("An error occurred.");
		}
	});

	$("#back").on("click", function() {
		window.location.search = "";
	});

	$("#dark-mode-toggle").on("click", function() {
		if(darkMode) {
			Cookies.remove("dark-mode");
		} else {
			Cookies.set("dark-mode", "true", { expires: 365 });
		}

		window.toggleDarkMode();
	});
}

function toggleDarkMode() {
	if(darkMode) {
		$("body").removeClass("dark-mode");
	} else {
		$("body").addClass("dark-mode");
	}

	darkMode = !darkMode;
}
