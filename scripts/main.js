API_URL = "https://api.tracker.gg/api"
CORS_PROXY_URL = "https://whats-my-kd-cors-proxy.herokuapp.com"
MATCHES_PATH = "v1/modern-warfare/matches"
PROFILE_PATH = "v2/modern-warfare/standard/profile"
FULL_STATS_URL_PREFIX = "https://cod.tracker.gg/modern-warfare/profile"
VERSION = '0'

var darkMode = false;

window.addEventListener("DOMContentLoaded", function() {
  preferences = window.localStorage.getItem("preferences")
  version = window.localStorage.getItem("version")
  if(version !== VERSION) {
    window.localStorage.clear()
    window.localStorage.setItem("preferences", preferences)
    window.localStorage.setItem("version", VERSION)
  }

  preferences = JSON.parse(preferences)
  if(preferences === null) {
    preferences = defaultPreferences();
    window.localStorage.setItem("preferences", JSON.stringify(preferences))
  }
  if(preferences.darkMode) {
    window.toggleDarkMode();
  }
});

window.onload = function() {
  if(darkMode) {
    $("#dark-mode-toggle").attr("checked", "checked");
  }

  var today = new Date();
  if(today.getHours() > 5) {
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6);
  } else {
    today = new Date(today.getTime());
    today.setDate(today.getDate() - 1);
    today.setHours(6);
  }

  var datepicker = $("#datepicker").pickadate({
    max: today,
    onClose: function() {
      $(document.activeElement).blur();
    }
  }).pickadate('picker');

  // Make datepicker's "today" match our concept of "today"
  if(!sameDay(today, datepicker.component.now())) {
    datepicker.component.item.now = datepicker.component.create(today);
    datepicker.set('highlight', today);
    datepicker.render();
  }

  $("#footer").html(generateFooterMessage());

  var wins;
  var losses;
  var kills;
  var deaths;
  var timePlayed;
  var start;

  resetStats();

  var urlParams = new URLSearchParams(window.location.search);
  var player = urlParams.get("id");
  var playerKey;
  var playerStorage;
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
    } else {
      $("#comment").html("");
    }
  }

  function generateFooterMessage() {
    return FOOTER_MESSAGES[Math.floor(Math.random() * FOOTER_MESSAGES.length)]
  }

  function getData() {
    end = new Date(start.getTime());
    end.setDate(start.getDate() + 1);
    storeKey = toDateString(start);

    if(sameDay(start, today)) {
      getDataHelper(end)
    } else {
      if(playerStorage[storeKey]) {
        setDataFromStore(playerStorage[storeKey]);
      } else {
        getDataHelper(end, storeKey)
      }
    }
  }

  function getDataHelper(end, storeKey = null) {
    $.getJSON(
      `${CORS_PROXY_URL}/${API_URL}/${MATCHES_PATH}/${platform}/${encodedPlayer}?` +
      `type=mp&next=${end.getTime()}`
    )
      .done(function(data) { setData(data, storeKey); })
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
    start = new Date(today.getTime());
    setDate();

    $.getJSON(
      `${CORS_PROXY_URL}/${API_URL}/${PROFILE_PATH}/${platform}/${encodedPlayer}`
    )
      .done(function(data) {
        $(".search").hide();
        $("#platform-icon").attr("src", `images/${platform}.png`);
        name = data.data.platformInfo.platformUserHandle
        playerKey = `${platform}-${name}`
        $("#name").html(name);
        avatarUrl = data.data.platformInfo.avatarUrl
        if(avatarUrl == null || avatarUrl == "") {
          avatarUrl = "images/default_avatar.png"
        }
        $("#avatar").attr("src", avatarUrl);

        playerStorage = window.localStorage.getItem(playerKey)
        playerStorage = playerStorage ? JSON.parse(playerStorage) : {}

        getData();
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

  function resetStats() {
    wins = 0;
    losses = 0;
    kills = 0;
    deaths = 0;
    timePlayed = 0;
  }

  function setData(data, storeKey) {
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

    next = new Date(data.data.metadata.next);
    if(i == matches.length && next > start) {
      return getDataHelper(next);
    } else if(storeKey) {
      playerStorage[storeKey] = {
        wins: wins,
        losses: losses,
        kills: kills,
        deaths: deaths,
        timePlayed: timePlayed
      }

      window.localStorage.setItem(playerKey, JSON.stringify(playerStorage))
    }

    displayData();
  }

  function setDataFromStore(data) {
    wins = data.wins
    losses = data.losses
    kills = data.kills
    deaths = data.deaths
    timePlayed = data.timePlayed

    displayData();
  }

  function setDate() {
    $("#date").html(prettyDateString(start));
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

  $("#dark-mode-toggle").click(function() {
    preferences = window.localStorage.getItem("preferences")
    preferences = preferences ? JSON.parse(preferences) : {}
    preferences.darkMode = !darkMode
    window.localStorage.setItem("preferences", JSON.stringify(preferences))
    window.toggleDarkMode();
  });

  $("#datepicker").change(function() {
    value = datepicker.get('select', 'yyyy-mm-dd')
    if(value == null || value == "") {
      return;
    }

    previous_date = start
    start = toDate(value);
    start.setHours(6);
    setDate();
    resetStats();

    if(sameDay(start, previous_date) || start > new Date()) {
      displayData();
      return;
    }

    $(".display").hide();
    $("#loader").show();
    getData(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 6));
  });

  $("#open-datepicker").click(function(event) {
    event.stopPropagation()
    datepicker.open();
  });
}

function defaultPreferences() {
  return {
    darkMode: false
  }
}

function toggleDarkMode() {
  if(darkMode) {
    $("body").removeClass("dark-mode");
  } else {
    $("body").addClass("dark-mode");
  }

  darkMode = !darkMode;
}
