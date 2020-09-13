API_URL = "https://api.tracker.gg/api";
CORS_PROXY_URL = "https://whats-my-kd-cors-proxy.herokuapp.com";
FULL_STATS_URL_PREFIX = "https://cod.tracker.gg/modern-warfare/profile";
MATCHES_PATH = "v1/modern-warfare/matches";
PROFILE_PATH = "v2/modern-warfare/standard/profile";
RATIO_PRECISION = 4;
VIEW_STATES = { search: 1, today: 2, history: 3 };
VERSION = '1';

var darkMode = false;
var chart;
var viewState;

window.addEventListener("DOMContentLoaded", function() {
  $("#footer-message").html(generateFooterMessage());

  preferences = window.localStorage.getItem("preferences")
  version = window.localStorage.getItem("version")
  if(version !== VERSION) {
    window.localStorage.clear()
    window.localStorage.setItem("preferences", preferences)
    window.localStorage.setItem("version", VERSION)
  }

  preferences = JSON.parse(preferences)
  if(!preferences) {
    preferences = defaultPreferences();
    window.localStorage.setItem("preferences", JSON.stringify(preferences))
  }
  if(preferences.darkMode) window.toggleDarkMode();
});

window.onload = function() {
  if(darkMode) $("#toggle-dark-mode").attr("checked", "checked");

  var today = new Date();
  if(today.getHours() > 5) {
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6);
  } else {
    today = new Date(today.getTime());
    today.setDate(today.getDate() - 1);
    today.setHours(6);
  }

  datepickers = [
    $("#datepicker-today"),
    $("#datepicker-start"),
    $("#datepicker-end")
  ].map(function(datepicker) {
    datepicker = datepicker.pickadate({
      max: today,
      onClose: function() {
        $(document.activeElement).blur();
      }
    }).pickadate('picker');

    // Make datepicker's "today" match WMKD's concept of "today"
    if(!sameDay(today, datepicker.component.now())) {
      datepicker.component.item.now = datepicker.component.create(today);
      datepicker.set('highlight', today);
      datepicker.render();
    }

    return datepicker;
  });
  var datepickerToday = datepickers[0];
  var datepickerStart = datepickers[1];
  var datepickerEnd = datepickers[2];

  var chartGenerated = false;

  var wins;
  var losses;
  var kills;
  var deaths;
  var timePlayed;
  var overallKD;

  var start = new Date(today.getTime());
  var historyStart = new Date(today.getTime());
  var historyEnd = new Date(today.getTime());

  historyStart.setDate(historyEnd.getDate() - 6);
  datepickerStart.set('highlight', historyStart);
  datepickerStart.set('max', historyEnd);
  datepickerEnd.set('min', historyStart);

  setDate();
  setHistoryDates();

  resetStats();

  var urlParams = new URLSearchParams(window.location.search);
  var player = urlParams.get("id");
  var playerKey;
  var playerStorage;
  var encodedPlayer = encodeURIComponent(player);
  var platform = urlParams.get("platform");

  if(playerSelected()) {
    $("#show-today, #show-history").addClass("bottom-nav-selectable");
    setViewState("today");
    process();
  } else {
    setViewState("search");
    $("#show-search").addClass("bottom-nav-selected");
    $("#load-percentage").html("");
    $(".loader").hide();
    $(".search").show();
  }

  function renderChart() {
    chart.render("chart-container-history", undefined, function() {
      credit = $("g[class^='raphael-group-'][class$='-creditgroup'] text");
      credit.attr("id", "fusion-charts-credit");
      credit.html('Powered by FusionCharts');
      credit.show();
    });
  }

  function CheckResponseErrorMessage(data, message) {
    return data && data.responseJSON && data.responseJSON.errors && data.responseJSON.errors[0] &&
      data.responseJSON.errors[0].message === message;
  }

  function completeSettingData(context) {
    context.daysLeft -= 1;
    context.daysProcessed += 1

    if(context.skipTo) {
      skippedDays = daysBetween(context.skipToStart, context.start) - 1;
      if(skippedDays > context.daysLeft) skippedDays = context.daysLeft;
      context.daysLeft -= skippedDays;
      context.daysProcessed += skippedDays;
    }

    if(context.daysLeft === 0) {
      if(context.skipTo) processSkippedDays(context, skippedDays);

      if(context.forChart) {
        generateChart(context);
      } else {
        mostRecentDayData = context.data[0]

        wins = mostRecentDayData.wins
        losses = mostRecentDayData.losses
        kills = mostRecentDayData.kills
        deaths = mostRecentDayData.deaths
        timePlayed = mostRecentDayData.timePlayed
        displayData();
      }
    } else {
      if(context.skipTo) {
        processSkippedDays(context, skippedDays);
      } else {
        context.end = context.start;
        context.start = new Date(context.start.getTime());
        context.start.setDate(context.start.getDate() - 1);
      }

      context.data.push(newDayData(context.start));

      if(context.forChart) {
        percentage = Math.round(
          (context.daysProcessed / (context.daysProcessed + context.daysLeft)) * 100
        )
        $("#load-percentage").html(`${percentage} %`)
      }

      getDataForDay(context);
    }
  }

  function displayError(errorMessage = "An error occurred.") {
    resetStats();
    chartGenerated = false;
    chart = player = playerKey = playerStorage = encodedPlayer = platform = overallKD = null;

    $(".bottom-nav-selected").removeClass("bottom-nav-selected");
    $(".bottom-nav-selectable").removeClass("bottom-nav-selectable");
    $("#show-search").addClass("bottom-nav-selected");
    $("#show-search").addClass("bottom-nav-selectable");

    setViewState("search");

    $(".display").hide();
    $("#load-percentage").html("");
    $(".loader").hide();
    $(".search").show();
    $("#error").html(errorMessage);
    $("#error").show();
  }

  function displayData() {
    setViewState("today");
    $("#load-percentage").html("");
    $(".loader").hide();
    $("#show-today").addClass("bottom-nav-selected");
    $(".display").show();
    $("#show-today, #show-history").addClass("bottom-nav-selectable");

    kd_ratio = (kills / (deaths || 1)).toPrecision(RATIO_PRECISION);
    kills_string = pluralityString(kills, 'kill', 'kills');
    deaths_string = pluralityString(deaths, 'death', 'deaths');
    $("#kd").html(`${kills_string} / ${deaths_string} = ${kd_ratio} KD`);

    wl_ratio = (wins / (losses || 1)).toPrecision(RATIO_PRECISION);
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

  function generateChart(context) {
    categories = [];
    winLosses = [];
    killDeaths = [];
    timePlayeds = [];
    for(i = context.data.length - 1; i >= 0; i--) {
      dayData = context.data[i];
      categories.push({ label: shortDateString(dayData.day) })

      if(dayData.timePlayed > 0) {
        winLoss = dayData.wins / (dayData.losses === 0 ? 1 : dayData.losses);
        killDeath = dayData.kills / (dayData.deaths === 0 ? 1 : dayData.deaths);
        winLosses.push({ value: winLoss.toPrecision(RATIO_PRECISION) });
        killDeaths.push({ value: killDeath.toPrecision(RATIO_PRECISION) });
        timePlayeds.push({ value: dayData.timePlayed / (60 * 60)  })
      } else {
        winLosses.push({});
        killDeaths.push({});
        timePlayeds.push({});
      }
    }

    color = darkMode ? "#ffffff" : "#000000"
    chartData = {
      chart: {
        lineThickness: 2,
        theme: "zune",
        connectNullData: "1",
        bgAlpha: 0,
        canvasBgAlpha: 0,
        baseFontSize: 15,
        baseFontColor: color,
        legendItemFontColor: color,
        trendlineColor: color
      },
      categories: [
        {
          category: categories
        }
      ],
      dataset: [
        {
          parentYAxis: "P",
          renderAs: "line",
          visible: "1",
          color: "#179fd1",
          seriesName: "W/L",
          data: winLosses
        },
        {
          parentYAxis: "P",
          renderAs: "line",
          visible: "1",
          color: "#e38b19",
          seriesName: "K/D",
          data: killDeaths
        },
        {
          parentYAxis: "S",
          renderAs: "column",
          visible: "1",
          color: "#34c0eb",
          alpha: "25",
          seriesName: "Hours Played",
          data: timePlayeds
        }
      ],
      trendlines: [{
        line: [
          {
            startValue: overallKD,
            endValue: overallKD,
            dashed: "1"
          }
        ]
      }]
    }

    if(chartGenerated) {
      chart.setJSONData(chartData);
      renderChart();

      $("#load-percentage").html("");
      $(".loader").hide();
      $(".display-history").show();
    } else {
      FusionCharts.ready(function () {
        chart = new FusionCharts({
          type: "mscombidy2d",
          renderAt: "chart-container-history",
          width: "98%",
          height: "50%",
          dataFormat: "json",
          dataSource: chartData
        })
        chart.setTransparent(true);
        renderChart();
      });

      chartGenerated = true;
      $("#load-percentage").html("");
      $(".loader").hide();
      $(".display-today").hide();
      $(".display-history").show();
    }
  }

  function getData(options = {}) {
    if(options.days && options.days < 1) return displayError();

    context = {
      daysLeft: options.days || 1,
      daysProcessed: 0,
      forChart: options.chart || false,
      start: options.start || start
    }
    context.data = [newDayData(context.start)],
    context.end = new Date(context.start.getTime());
    context.end.setDate(context.start.getDate() + 1);

    if(sameDay(context.start, today)) {
      getDataHelper(context);
    } else {
      getDataForDay(context);
    }
  }

  function getDataForDay(context) {
    if(playerStorage[numericDateString(context.start)]) {
      setDataFromStore(context);
    } else if(context.remainingMatches) {
      setData(null, context)
    } else {
      getDataHelper(context)
    }
  }

  function getDataHelper(context) {
    $.getJSON(
      `${CORS_PROXY_URL}/${API_URL}/${MATCHES_PATH}/${platform}/${encodedPlayer}?` +
      `type=mp&next=${context.end.getTime()}`
    )
      .done(function(data) { setData(data, context); })
      .fail(function(data) {
        if(!data) {
          displayError("The Tracker Network failed to respond.");
        } else if(CheckResponseErrorMessage(data, "Unable to retrieve match data at this time.")) {
          displayError("The Call of Duty API failed to respond.");
        } else {
          displayError("Failed to retrieve match data.");
        }
      });
  }

  function inViewState(state) {
    return viewState === VIEW_STATES[state];
  }

  function pluralityString(number, singularWord, pluralWord) {
    return string = `${number} ${number === 1 ? singularWord : pluralWord}`;
  }

  function newDayData(day) {
    return { day: day, wins: 0, losses: 0, kills: 0, deaths: 0, timePlayed: 0 }
  }

  function playerSelected() {
    return player && platform;
  }

  function process() {
    $("#name-today").html(player);
    $("#name-history").html(player);
    full_stats_url = `${FULL_STATS_URL_PREFIX}/${platform}/${encodedPlayer}/mp`
    $("#name-today").attr("href", full_stats_url);
    $("#name-history").attr("href", full_stats_url);
    $("#avatar-anchor-today").attr("href", full_stats_url);
    $("#avatar-anchor-history").attr("href", full_stats_url);
    kills = 0;
    deaths = 0;

    $.getJSON(
      `${CORS_PROXY_URL}/${API_URL}/${PROFILE_PATH}/${platform}/${encodedPlayer}`
    )
      .done(function(data) {
        $(".search").hide();
        platformIconUrl = `images/${platform}.png`
        $("#platform-icon-today").attr("src", platformIconUrl);
        $("#platform-icon-history").attr("src", platformIconUrl);
        name = data.data.platformInfo.platformUserHandle
        playerKey = `${platform}-${name}`
        $("#name-today").html(name);
        $("#name-history").html(name);
        avatarUrl = data.data.platformInfo.avatarUrl
        if(!avatarUrl) avatarUrl = "images/default_avatar.png";
        $("#avatar-today").attr("src", avatarUrl);
        $("#avatar-history").attr("src", avatarUrl);

        overallKD = data.data.segments[0].stats.kDRatio.value

        playerStorage = window.localStorage.getItem(playerKey)
        playerStorage = playerStorage ? JSON.parse(playerStorage) : {}

        getData();
      })
      .fail(function(data) {
        if(!data) {
          displayError("The Tracker Network failed to respond.");
        } else if(CheckResponseErrorMessage(data, "This profile is private.")) {
          displayError("Player profile is private.");
        } else {
          displayError("Player not found: profile is private or name is incorrect.");
        }
      });
  }

  function processSkippedDays(context, skippedDays) {
    for(i = 1; i <= skippedDays; i++) {
      tempDate = new Date(context.start.getTime());
      tempDate.setDate(tempDate.getDate() - i);
      context.data.push(newDayData(tempDate));
      playerStorage[numericDateString(tempDate)] =
        { wins: 0, losses: 0, kills: 0, deaths: 0, timePlayed: 0 };
    }

    window.localStorage.setItem(playerKey, JSON.stringify(playerStorage));
    context.start = context.skipToStart;
    context.end = context.skipTo;
    context.skipTo = null;
    context.skipToStart = null;
  }

  function resetStats() {
    wins = 0;
    losses = 0;
    kills = 0;
    deaths = 0;
    timePlayed = 0;
  }

  function setData(data, context) {
    if(data) {
      if(!("data" in data) || !("matches" in data.data)) {
        displayError("The Tracker Network failed to retrieve the data.");
      }

      matches = data.data.matches;
    } else if(context.remainingMatches) {
      matches = context.remainingMatches
    } else {
      displayError();
    }

    dayData = context.data[context.data.length - 1];
    i = 0;
    matchEnd = null
    for(; i < matches.length; i++) {
      var matchData = matches[i];
      matchEnd = new Date(
        new Date(matchData.metadata.timestamp).getTime() + matchData.metadata.duration.value
      )
      if(matchEnd > context.end) continue;
      if(matchEnd < context.start) break;

      if(matchData.segments[0].metadata.hasWon) {
        dayData.wins += 1;
      } else {
        dayData.losses += 1;
      }

      stats = matchData.segments[0].stats;
      dayData.kills += stats.kills.value;
      dayData.deaths += stats.deaths.value;

      dayData.timePlayed += stats.timePlayed.value;
    }

    next = new Date(matchEnd.getTime() - 1);
    if(i === matches.length && next > context.start) {
      if(next < context.end) context.end = next;
      context.remainingMatches = null;
      return getDataHelper(context);
    } else {
      if(!sameDay(today, context.start)) {
        playerStorage[numericDateString(context.start)] = {
          wins: dayData.wins,
          losses: dayData.losses,
          kills: dayData.kills,
          deaths: dayData.deaths,
          timePlayed: dayData.timePlayed
        };

        window.localStorage.setItem(playerKey, JSON.stringify(playerStorage));
      }

      context.remainingMatches = matches.slice(i, matches.length);

      matchEnd.setMilliseconds(matchEnd.getMilliseconds() + 1);
      context.skipTo = matchEnd;
      offset = context.skipTo.getHours() > 5 ? 0 : -1
      context.skipToStart = new Date(
        context.skipTo.getFullYear(),
        context.skipTo.getMonth(),
        context.skipTo.getDate() + offset,
        6
      );
    }

    completeSettingData(context);
  }

  function setDataFromStore(context) {
    data = playerStorage[numericDateString(context.start)]
    dayData = context.data[context.data.length - 1];

    dayData.wins = data.wins;
    dayData.losses = data.losses;
    dayData.kills = data.kills;
    dayData.deaths = data.deaths;
    dayData.timePlayed = data.timePlayed;

    completeSettingData(context);
  }

  function setDate() {
    $("#date-today").html(prettyDateString(start));
  }

  function setHistoryDates() {
    datepickerStart.set('max', historyEnd);
    datepickerEnd.set('min', historyStart);
    $("#date-history").html(
      `${shortPrettyDateString(historyStart)} - ${shortPrettyDateString(historyEnd)}`
    )
  }

  function setViewState(state) {
    viewState = VIEW_STATES[state];
  }

  $("#username").on("keyup", function() {
    if(event.key !== "Enter") return;

    $("#search").click();
    event.preventDefault();
  });

  $(document).on("click", "#search", function() {
    $("#error").hide();
    $(".search").hide()
    $(".loader").show();
    var searchParams = new URLSearchParams();
    var temp_id = $("#username").val()
    if(!temp_id) return displayError("Enter a username.");

    searchParams.set("id", temp_id);
    var temp_platform = $("input[name=platform]:checked").val()
    if(!temp_platform) return displayError("Select a platform.");

    if(temp_platform === "battlenet" && !/^.+#.*$/.test(temp_id)) {
      return displayError(
        "Must include number for Battlenet usernames. For example, \"CaptainPrice#1911\"."
      );
    }

    searchParams.set("platform", temp_platform);
    window.location.search = searchParams.toString();

    try {
      process();
    } catch(error) {
      displayError();
    }
  });

  $("#toggle-dark-mode").click(function() {
    preferences = window.localStorage.getItem("preferences")
    preferences = preferences ? JSON.parse(preferences) : {}
    preferences.darkMode = !darkMode
    window.localStorage.setItem("preferences", JSON.stringify(preferences))
    window.toggleDarkMode();
  });

  $("#show-search").click(function() {
    if(inViewState("search")) return;

    $(".bottom-nav-selected").removeClass("bottom-nav-selected");
    $("#show-search").addClass("bottom-nav-selected");
    setViewState("search");

    $(".display").hide();
    $("#load-percentage").html("");
    $(".loader").hide();
    $(".search").show();
  });

  $("#show-today").click(function() {
    if(inViewState("today") || !playerSelected()) return;

    $(".bottom-nav-selected").removeClass("bottom-nav-selected");
    $("#show-today").addClass("bottom-nav-selected");
    setViewState("today");

    $(".search").hide();
    $(".display").show();
    $(".display-today").show();
    $(".display-history").hide();
  });

  $("#show-history").click(function() {
    if(inViewState("history") || !playerSelected()) return;

    $(".bottom-nav-selected").removeClass("bottom-nav-selected")
    $("#show-history").addClass("bottom-nav-selected")
    setViewState("history");

    $(".search").hide();
    $(".display").show();
    if(chartGenerated) {
      $("#load-percentage").html("");
      $(".loader").hide();
      $(".display-today").hide();
      $(".display-history").show();

      // For some reason, changing chart attributes when the chart is not visible causes it
      // to display incorrectly. To fix this, we always set an attribute that has no effect
      // each time the chart becomes visible again to update it without a full re-render.
      chart.setChartAttribute({ bgColor: "#000000" });
    } else {
      $(".display-today").hide();
      $("#load-percentage").html("0 %");
      $(".loader").show();
      getData({ chart: true, days: daysBetween(historyStart, historyEnd) + 1, start: historyEnd });
    }
  });

  $("#datepicker-today").change(function() {
    value = datepickerToday.get('select', 'yyyy-mm-dd')
    if(!value) return;

    previous_date = start
    start = toDate(value);
    start.setHours(6);
    setDate();
    resetStats();

    if(sameDay(start, previous_date) || start > new Date()) return displayData();

    $(".display").hide();
    $(".loader").show();
    getData();
  });

  $("#history-submit").click(function() {
    $(".display-history").hide();
    $("#load-percentage").html("0 %");
    $(".loader").show();
    getData({ chart: true, days: daysBetween(historyStart, historyEnd) + 1, start: historyEnd });
  });

  $("#datepicker-start").change(function() {
    value = datepickerStart.get('select', 'yyyy-mm-dd')
    if(!value) return;

    previous_date = historyStart;
    historyStart = toDate(value);
    historyStart.setHours(6);

    if(sameDay(historyStart, previous_date) || historyStart > new Date()) return;
    setHistoryDates();
  });
  $("#datepicker-end").change(function() {
    value = datepickerEnd.get('select', 'yyyy-mm-dd')
    if(!value) return;

    previous_date = historyEnd;
    historyEnd = toDate(value);
    historyEnd.setHours(6);
    setHistoryDates();

    if(sameDay(historyEnd, previous_date) || historyEnd > new Date()) return;
    setHistoryDates();
  });

  $("#open-datepicker-today").click(function(event) {
    event.stopPropagation()
    datepickerToday.open();
  });
  $("#open-datepicker-start").click(function(event) {
    event.stopPropagation()
    datepickerStart.open();
  });
  $("#open-datepicker-end").click(function(event) {
    event.stopPropagation()
    datepickerEnd.open();
  });
}

function defaultPreferences() {
  return {
    darkMode: false
  }
}

function generateFooterMessage() {
  return FOOTER_MESSAGES[Math.floor(Math.random() * FOOTER_MESSAGES.length)]
}

function toggleDarkMode() {
  darkMode = !darkMode;

  if(darkMode) {
    $("body").addClass("dark-mode");
  } else {
    $("body").removeClass("dark-mode");
  }

  if(chart) {
    color = darkMode ? "#ffffff" : "#000000"
    chart.setChartAttribute({
      baseFontColor: color,
      legendItemFontColor: color,
      trendlineColor: color
    })
  }
}
