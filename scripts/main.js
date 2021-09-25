const API_URL = 'https://api.tracker.gg/api'
const CORS_PROXY_URL = 'https://whats-my-kd-cors-proxy.herokuapp.com'
const FULL_STATS_URL_PREFIXES = {
  modernWarfare: 'https://cod.tracker.gg/modern-warfare/profile',
  coldWar: 'https://cod.tracker.gg/cold-war/profile'
}
const GAMES = ['modernWarfare', 'coldWar']
const MATCHES_PATHS = { modernWarfare: 'v1/modern-warfare/matches', coldWar: 'v1/cold-war/matches' }
const PROFILE_PATHS = {
  modernWarfare: 'v2/modern-warfare/standard/profile',
  coldWar: 'v2/cold-war/standard/profile'
}
const RATIO_PRECISION = 4
const VIEW_STATES = { search: 1, today: 2, history: 3 }
const VERSION = '2'

var chart
var darkMode = false
var game
var viewState

window.addEventListener('DOMContentLoaded', function () {
  $('#footer-message').html(generateFooterMessage())

  var preferences = window.localStorage.getItem('preferences')
  const version = window.localStorage.getItem('version')
  if (version !== VERSION) {
    window.localStorage.clear()
    window.localStorage.setItem('preferences', preferences)
    window.localStorage.setItem('version', VERSION)
  }

  preferences = JSON.parse(preferences) || {}
  const missingPreferences =
    Object.keys(defaultPreferences()).filter(x => !Object.keys(preferences).includes(x))
  if (missingPreferences) {
    for (var i = 0; i < missingPreferences.length; i++) {
      preferences[missingPreferences[i]] = defaultPreferences()[missingPreferences[i]]
    }

    window.localStorage.setItem('preferences', JSON.stringify(preferences))
  }
  if (preferences.darkMode) toggleDarkMode()
  if (!GAMES.includes(preferences.game)) {
    preferences.game = defaultPreferences().game
    window.localStorage.setItem('preferences', JSON.stringify(preferences))
  }
  game = preferences.game
})

$(document).ready(function () {
  if (darkMode) $('#toggle-dark-mode').attr('checked', 'checked')

  var today = new Date()
  if (today.getHours() > 5) {
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6)
  } else {
    today = new Date(today.getTime())
    today.setDate(today.getDate() - 1)
    today.setHours(6)
  }

  var datepickers = [
    $('#datepicker-today'),
    $('#datepicker-start'),
    $('#datepicker-end')
  ].map(function (datepicker) {
    datepicker = datepicker.pickadate({
      max: today,
      onClose: function () {
        $(document.activeElement).blur()
      }
    }).pickadate('picker')

    // Make datepicker's "today" match WMKD's concept of "today"
    if (!sameDay(today, datepicker.component.now())) {
      datepicker.component.item.now = datepicker.component.create(today)
      datepicker.set('highlight', today)
      datepicker.render()
    }

    return datepicker
  })
  const datepickerToday = datepickers[0]
  const datepickerStart = datepickers[1]
  const datepickerEnd = datepickers[2]

  var chartGenerated = false

  var wins
  var losses
  var kills
  var deaths
  var timePlayed
  var overallKD

  var start = new Date(today.getTime())
  var historyStart = new Date(today.getTime())
  var historyEnd = new Date(today.getTime())

  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get('game')) {
    setGame(urlParams.get('game'))
    const preferences = JSON.parse(window.localStorage.getItem('preferences'))
    preferences.game = game
    window.localStorage.setItem('preferences', JSON.stringify(preferences))
  } else {
    setGame(game)
  }

  historyStart.setDate(historyEnd.getDate() - 6)
  datepickerStart.set('highlight', historyStart)
  datepickerStart.set('max', historyEnd)
  datepickerEnd.set('min', historyStart)

  setDate()
  setHistoryDates()

  resetStats()

  var player = urlParams.get('id')
  var playerKey
  var playerStorage
  var encodedPlayer = encodeURIComponent(player)
  var platform = urlParams.get('platform')

  if (playerSelected()) {
    $('#show-today, #show-history').addClass('bottom-nav-selectable')
    setViewState('today')
    process()
  } else {
    setViewState('search')
    $('#show-search').addClass('bottom-nav-selected')
    $('#load-percentage').html('')
    $('.loader').hide()
    $('.search').show()
  }

  function CheckResponseErrorMessage (data, message) {
    return data && data.responseJSON && data.responseJSON.errors && data.responseJSON.errors[0] &&
      data.responseJSON.errors[0].message === message
  }

  function completeSettingData (context) {
    context.daysLeft -= 1
    context.daysProcessed += 1

    if (context.skipTo) {
      var skippedDays = daysBetween(context.skipToStart, context.start) - 1
      if (skippedDays > context.daysLeft) skippedDays = context.daysLeft
      context.daysLeft -= skippedDays
      context.daysProcessed += skippedDays
    }

    if (context.daysLeft === 0) {
      if (context.skipTo) processSkippedDays(context, skippedDays)

      if (context.forChart) {
        generateChart(context)
      } else {
        const mostRecentDayData = context.data[0]

        wins = mostRecentDayData.wins
        losses = mostRecentDayData.losses
        kills = mostRecentDayData.kills
        deaths = mostRecentDayData.deaths
        timePlayed = mostRecentDayData.timePlayed
        displayData()
      }
    } else {
      if (context.skipTo) {
        processSkippedDays(context, skippedDays)
      } else {
        context.end = context.start
        context.start = new Date(context.start.getTime())
        context.start.setDate(context.start.getDate() - 1)
      }

      context.data.push(newDayData(context.start))

      if (context.forChart) {
        const percentage = Math.round(
          (context.daysProcessed / (context.daysProcessed + context.daysLeft)) * 100
        )
        $('#load-percentage').html(`${percentage} %`)
      }

      getDataForDay(context)
    }
  }

  function displayError (errorMessage = 'An error occurred.') {
    resetStats()
    chartGenerated = false
    chart = player = playerKey = playerStorage = encodedPlayer = platform = overallKD = null

    $('.bottom-nav-selected').removeClass('bottom-nav-selected')
    $('.bottom-nav-selectable').removeClass('bottom-nav-selectable')
    $('#show-search').addClass('bottom-nav-selected')
    $('#show-search').addClass('bottom-nav-selectable')

    setViewState('search')

    $('.display').hide()
    $('#load-percentage').html('')
    $('.loader').hide()
    $('.search').show()
    $('#error').html(errorMessage)
    $('#error').show()
  }

  function displayData () {
    setViewState('today')
    $('#load-percentage').html('')
    $('.loader').hide()
    $('#show-today').addClass('bottom-nav-selected')
    $('.display').show()
    $('#show-today, #show-history').addClass('bottom-nav-selectable')

    const kdRatio = (kills / (deaths || 1)).toPrecision(RATIO_PRECISION)
    const killsString = pluralityString(kills, 'kill', 'kills')
    const deathsString = pluralityString(deaths, 'death', 'deaths')
    $('#kd').html(`${killsString} / ${deathsString} = ${kdRatio} KD`)

    upArrowClass = 'fa-long-arrow-alt-up'
    downArrowClass = 'fa-long-arrow-alt-down'
    $('#kd-diff').removeClass(`${upArrowClass} ${downArrowClass}`)
    $('#wl-diff').removeClass(`${upArrowClass} ${downArrowClass}`)

    const wlRatio = (wins / (losses || 1)).toPrecision(RATIO_PRECISION)
    const winsString = pluralityString(wins, 'win', 'wins')
    const lossesString = pluralityString(losses, 'loss', 'losses')
    $('#wl').html(`${winsString} / ${lossesString} = ${wlRatio} WL`)

    const hours = Math.floor(timePlayed / (60 * 60))
    const minutes = Math.floor(timePlayed / 60 % 60)
    const seconds = timePlayed % 60

    const hoursString = pluralityString(hours, 'hour', 'hours')
    const minutesString = pluralityString(minutes, 'minute', 'minutes')
    const secondsString = pluralityString(seconds, 'second', 'seconds')
    $('#time-played').html(`${hoursString}, ${minutesString}, and ${secondsString} played`)

    if (losses > 0 || wins > 0) {
      if (wlRatio > overallWL) {
        $('#wl-diff').addClass(upArrowClass)
      } else if (wlRatio < overallWL) {
        $('#wl-diff').addClass(downArrowClass)
      }
    }

    if (deaths > 0 || kills > 0) {
      if (kdRatio > overallKD) {
        $('#kd-diff').addClass(upArrowClass)
      } else if (kdRatio < overallKD) {
        $('#kd-diff').addClass(downArrowClass)
      }

      if (kdRatio < 0.5) {
        $('#comment').html('You kinda suck today, bruh.')
      } else if (kdRatio < 0.8) {
        $('#comment').html('Ehhh...')
      } else if (kdRatio < 0.95) {
        $('#comment').html('Not so hot.')
      } else if (kdRatio < 1.15) {
        $('#comment').html('Not too shabby.')
      } else if (kdRatio < 1.5) {
        $('#comment').html('Noice.')
      } else if (kdRatio < 2) {
        $('#comment').html("Hey, that's pretty good.")
      } else if (kdRatio < 3) {
        $('#comment').html('Damn, son.')
      } else {
        $('#comment').html("You're cracked, bro")
      }
    } else {
      $('#comment').html('')
    }
  }

  function fullStatsUrlPrefix () {
    return FULL_STATS_URL_PREFIXES[game]
  }

  function generateChart (context) {
    const categories = []
    const winLosses = []
    const killDeaths = []
    const timePlayeds = []
    for (var i = context.data.length - 1; i >= 0; i--) {
      const dayData = context.data[i]
      categories.push({ label: shortDateString(dayData.day) })

      if (dayData.timePlayed > 0) {
        const winLoss = dayData.wins / (dayData.losses === 0 ? 1 : dayData.losses)
        const killDeath = dayData.kills / (dayData.deaths === 0 ? 1 : dayData.deaths)
        winLosses.push({ value: winLoss.toPrecision(RATIO_PRECISION) })
        killDeaths.push({ value: killDeath.toPrecision(RATIO_PRECISION) })
        timePlayeds.push({ value: dayData.timePlayed / (60 * 60) })
      } else {
        winLosses.push({})
        killDeaths.push({})
        timePlayeds.push({})
      }
    }

    const color = darkMode ? '#ffffff' : '#000000'
    const chartData = {
      chart: {
        lineThickness: 2,
        theme: 'zune',
        connectNullData: '1',
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
          parentYAxis: 'P',
          renderAs: 'line',
          visible: '1',
          color: '#179fd1',
          seriesName: 'W/L',
          data: winLosses
        },
        {
          parentYAxis: 'P',
          renderAs: 'line',
          visible: '1',
          color: '#e38b19',
          seriesName: 'K/D',
          data: killDeaths
        },
        {
          parentYAxis: 'S',
          renderAs: 'column',
          visible: '1',
          color: '#34c0eb',
          alpha: '25',
          seriesName: 'Hours Played',
          data: timePlayeds
        }
      ],
      trendlines: [{
        line: [
          {
            startValue: overallKD,
            endValue: overallKD,
            dashed: '1'
          }
        ]
      }]
    }

    if (chartGenerated) {
      chart.setJSONData(chartData)
      renderChart()

      $('#load-percentage').html('')
      $('.loader').hide()
      $('.display-history').show()
    } else {
      FusionCharts.ready(function () {
        chart = new FusionCharts({
          type: 'mscombidy2d',
          renderAt: 'chart-container-history',
          width: '98%',
          height: '50%',
          dataFormat: 'json',
          dataSource: chartData
        })
        chart.setTransparent(true)
        renderChart()
      })

      chartGenerated = true
      $('#load-percentage').html('')
      $('.loader').hide()
      $('.display-today').hide()
      $('.display-history').show()
    }
  }

  function getData (options = {}) {
    if (options.days && options.days < 1) return displayError()

    const context = {
      daysLeft: options.days || 1,
      daysProcessed: 0,
      forChart: options.chart || false,
      start: options.start || start
    }
    context.data = [newDayData(context.start)]
    context.end = new Date(context.start.getTime())
    context.end.setDate(context.start.getDate() + 1)

    if (sameDay(context.start, today)) {
      getDataHelper(context)
    } else {
      getDataForDay(context)
    }
  }

  function getDataForDay (context) {
    if (playerStorage[game][numericDateString(context.start)]) {
      setDataFromStore(context)
    } else if (context.remainingMatches) {
      setData(null, context)
    } else {
      getDataHelper(context)
    }
  }

  function getDataHelper (context) {
    $.getJSON(
      `${CORS_PROXY_URL}/${API_URL}/${matchesPath()}/${platform}/${encodedPlayer}?` +
      `type=mp&next=${context.end.getTime()}`
    )
      .done(function (data) { setData(data, context) })
      .fail(function (data) {
        if (!data) {
          displayError('The Tracker Network failed to respond.')
        } else if (CheckResponseErrorMessage(data, 'Unable to retrieve match data at this time.')) {
          displayError('The Call of Duty API failed to respond.')
        } else {
          displayError('Failed to retrieve match data.')
        }
      })
  }

  function getOverallKD (data) {
    const stats = data.data.segments[0].stats
    return (stats.kills.value / (stats.deaths.value || 1)).toPrecision(RATIO_PRECISION)
  }

  function getOverallWL (data) {
    const stats = data.data.segments[0].stats
    return (stats.wins.value / (stats.losses.value || 1)).toPrecision(RATIO_PRECISION)
  }

  function inViewState (state) {
    return viewState === VIEW_STATES[state]
  }

  function matchesPath () {
    return MATCHES_PATHS[game]
  }

  function newDayData (day) {
    return { day: day, wins: 0, losses: 0, kills: 0, deaths: 0, timePlayed: 0 }
  }

  function playerSelected () {
    return player && platform
  }

  function pluralityString (number, singularWord, pluralWord) {
    return `${number} ${number === 1 ? singularWord : pluralWord}`
  }

  function process () {
    $('#name-today').html(player)
    $('#name-history').html(player)
    const fullStatsUrl = `${fullStatsUrlPrefix()}/${platform}/${encodedPlayer}/mp`
    $('#name-today').attr('href', fullStatsUrl)
    $('#name-history').attr('href', fullStatsUrl)
    $('#avatar-anchor-today').attr('href', fullStatsUrl)
    $('#avatar-anchor-history').attr('href', fullStatsUrl)
    kills = 0
    deaths = 0

    $.getJSON(
      `${CORS_PROXY_URL}/${API_URL}/${profilePath()}/${platform}/${encodedPlayer}`
    )
      .done(function (data) {
        $('.search').hide()
        const platformIconUrl = `images/${platform}.png`
        $('#platform-icon-today').attr('src', platformIconUrl)
        $('#platform-icon-history').attr('src', platformIconUrl)
        const name = data.data.platformInfo.platformUserHandle
        playerKey = `${platform}-${name}`
        $('#name-today').html(name)
        $('#name-history').html(name)
        const avatarUrl = data.data.platformInfo.avatarUrl || 'images/default_avatar.png'
        $('#avatar-today').attr('src', avatarUrl)
        $('#avatar-history').attr('src', avatarUrl)

        overallKD = getOverallKD(data)
        overallWL = getOverallWL(data)

        playerStorage = window.localStorage.getItem(playerKey)
        if (playerStorage) {
          playerStorage = JSON.parse(playerStorage)
        } else {
          playerStorage = {}
          for (var i = 0; i < GAMES.length; i++) {
            playerStorage[GAMES[i]] = {}
          }
        }

        getData()
      })
      .fail(function (data) {
        if (!data) {
          displayError('The Tracker Network failed to respond.')
        } else if (CheckResponseErrorMessage(data, 'This profile is private.')) {
          displayError('Player profile is private.')
        } else {
          displayError(
            'Player not found: profile is private, name is incorrect, ' +
            'or player has not yet played this game.'
          )
        }
      })
  }

  function processSkippedDays (context, skippedDays) {
    for (var i = 1; i <= skippedDays; i++) {
      const tempDate = new Date(context.start.getTime())
      tempDate.setDate(tempDate.getDate() - i)
      context.data.push(newDayData(tempDate))
      playerStorage[game][numericDateString(tempDate)] =
        { wins: 0, losses: 0, kills: 0, deaths: 0, timePlayed: 0 }
    }

    window.localStorage.setItem(playerKey, JSON.stringify(playerStorage))
    context.start = context.skipToStart
    context.end = context.skipTo
    context.skipTo = null
    context.skipToStart = null
  }

  function profilePath () {
    return PROFILE_PATHS[game]
  }

  function renderChart () {
    chart.render('chart-container-history', undefined, function () {
      const credit = $("g[class^='raphael-group-'][class$='-creditgroup'] text")
      credit.attr('id', 'fusion-charts-credit')
      credit.html('Powered by FusionCharts')
      credit.show()
    })
  }

  function resetStats () {
    wins = 0
    losses = 0
    kills = 0
    deaths = 0
    timePlayed = 0
  }

  function selectGame (name) {
    if (game === name) return

    setGame(name)

    if (playerSelected()) {
      const searchParams = new URLSearchParams()
      searchParams.set('id', player)
      searchParams.set('platform', platform)
      searchParams.set('game', game)
      window.location.search = searchParams.toString()
    }
  }

  function setData (data, context) {
    var matches
    if (data) {
      if (!('data' in data) || !('matches' in data.data)) {
        displayError(
          'The Tracker Network failed to retrieve the data.<br>' +
          'This may be because you selected a range that starts before the player\'s ' +
            'first ever match in this game.<br>' +
          'The Tracker Network is dumb and will give an error if you do this :('
        )
      }

      matches = data.data.matches
    } else if (context.remainingMatches) {
      matches = context.remainingMatches
    } else {
      displayError()
    }

    const dayData = context.data[context.data.length - 1]
    var i = 0
    var matchEnd = null
    for (; i < matches.length; i++) {
      const matchData = matches[i]
      matchEnd = new Date(
        new Date(matchData.metadata.timestamp).getTime() + matchData.metadata.duration.value
      )
      if (matchEnd > context.end) continue
      if (matchEnd < context.start) break

      if (matchData.segments[0].metadata.hasWon) {
        dayData.wins += 1
      } else {
        dayData.losses += 1
      }

      const stats = matchData.segments[0].stats
      dayData.kills += stats.kills.value
      dayData.deaths += stats.deaths.value

      dayData.timePlayed += stats.timePlayed.value
    }

    const next = new Date(matchEnd.getTime() - 1)
    if (i === matches.length && next > context.start) {
      if (next < context.end) context.end = next
      context.remainingMatches = null
      return getDataHelper(context)
    } else {
      if (!sameDay(today, context.start)) {
        playerStorage[game][numericDateString(context.start)] = {
          wins: dayData.wins,
          losses: dayData.losses,
          kills: dayData.kills,
          deaths: dayData.deaths,
          timePlayed: dayData.timePlayed
        }

        window.localStorage.setItem(playerKey, JSON.stringify(playerStorage))
      }

      context.remainingMatches = matches.slice(i, matches.length)

      matchEnd.setMilliseconds(matchEnd.getMilliseconds() + 1)
      context.skipTo = matchEnd
      const offset = context.skipTo.getHours() > 5 ? 0 : -1
      context.skipToStart = new Date(
        context.skipTo.getFullYear(),
        context.skipTo.getMonth(),
        context.skipTo.getDate() + offset,
        6
      )
    }

    completeSettingData(context)
  }

  function setDataFromStore (context) {
    const data = playerStorage[game][numericDateString(context.start)]
    const dayData = context.data[context.data.length - 1]

    dayData.wins = data.wins
    dayData.losses = data.losses
    dayData.kills = data.kills
    dayData.deaths = data.deaths
    dayData.timePlayed = data.timePlayed

    completeSettingData(context)
  }

  function setDate () {
    $('#date-today').html(prettyDateString(start))
  }

  function setGame (name) {
    if (!GAMES.includes(name)) name = window.defaultPreferences().game
    game = name
    $('.game-menu-icon-toggle').hide()
    $(`.${camelCaseToKebabCase(game)}-icon-toggle`).show()
  }

  function setHistoryDates () {
    datepickerStart.set('max', historyEnd)
    datepickerEnd.set('min', historyStart)
    $('#date-history').html(
      `${shortPrettyDateString(historyStart)} - ${shortPrettyDateString(historyEnd)}`
    )
  }

  function setViewState (state) {
    viewState = VIEW_STATES[state]
  }

  $(document).click(function (event) {
    if (
      $('#open-sidebar-menu').prop('checked') &&
      !$('#sidebar-container').find(event.target).length
    ) {
      $('#open-sidebar-menu').prop('checked', false)
    }

    if (
      $('#open-game-menu').prop('checked') &&
      !$('#game-menu-container').find(event.target).length
    ) {
      $('#open-game-menu').prop('checked', false)
    }
  })

  $('#username').on('keyup', function () {
    if (event.key !== 'Enter') return

    $('#search').click()
    event.preventDefault()
  })

  $('#search').click(function () {
    $('#error').hide()
    $('.search').hide()
    $('.loader').show()
    const searchParams = new URLSearchParams()
    const tempId = $('#username').val()
    if (!tempId) return displayError('Enter a username.')

    searchParams.set('id', tempId)
    const tempPlatform = $('input[name=platform]:checked').val()
    if (!tempPlatform) return displayError('Select a platform.')

    if (tempPlatform === 'battlenet' && !/^.+#.*$/.test(tempId)) {
      return displayError(
        'Must include number for Battlenet usernames. For example, "CaptainPrice#1911".'
      )
    }

    searchParams.set('platform', tempPlatform)
    searchParams.set('game', game)
    window.location.search = searchParams.toString()
  })

  $('#open-sidebar-menu').change(function (event) {
    if (this.checked) $('#open-game-menu').prop('checked', false)
  })
  $('#open-game-menu').change(function () {
    if (this.checked) $('#open-sidebar-menu').prop('checked', false)
  })

  $('#select-modern-warfare').click(function () {
    selectGame('modernWarfare')
    $('#open-game-menu').prop('checked', false)
  })
  $('#select-cold-war').click(function () {
    selectGame('coldWar')
    $('#open-game-menu').prop('checked', false)
  })

  $('#toggle-dark-mode').click(function () {
    var preferences = window.localStorage.getItem('preferences')
    preferences = preferences ? JSON.parse(preferences) : {}
    preferences.darkMode = !darkMode
    window.localStorage.setItem('preferences', JSON.stringify(preferences))
    window.toggleDarkMode()
  })

  $('#show-search').click(function () {
    if (inViewState('search')) return

    $('.bottom-nav-selected').removeClass('bottom-nav-selected')
    $('#show-search').addClass('bottom-nav-selected')
    setViewState('search')

    $('.display').hide()
    $('#load-percentage').html('')
    $('.loader').hide()
    $('.search').show()
  })

  $('#show-today').click(function () {
    if (inViewState('today') || !playerSelected()) return

    $('.bottom-nav-selected').removeClass('bottom-nav-selected')
    $('#show-today').addClass('bottom-nav-selected')
    setViewState('today')

    $('.search').hide()
    $('.display').show()
    $('.display-today').show()
    $('.display-history').hide()
  })

  $('#show-history').click(function () {
    if (inViewState('history') || !playerSelected()) return

    $('.bottom-nav-selected').removeClass('bottom-nav-selected')
    $('#show-history').addClass('bottom-nav-selected')
    setViewState('history')

    $('.search').hide()
    $('.display').show()
    if (chartGenerated) {
      $('#load-percentage').html('')
      $('.loader').hide()
      $('.display-today').hide()
      $('.display-history').show()

      // For some reason, changing chart attributes when the chart is not visible causes it
      // to display incorrectly. To fix this, we always set an attribute that has no effect
      // each time the chart becomes visible again to update it without a full re-render.
      chart.setChartAttribute({ bgColor: '#000000' })
    } else {
      $('.display-today').hide()
      $('#load-percentage').html('0 %')
      $('.loader').show()
      getData({ chart: true, days: daysBetween(historyStart, historyEnd) + 1, start: historyEnd })
    }
  })

  $('#datepicker-today').change(function () {
    const value = datepickerToday.get('select', 'yyyy-mm-dd')
    if (!value) return

    const previousDate = start
    start = toDate(value)
    start.setHours(6)
    setDate()
    resetStats()

    if (sameDay(start, previousDate) || start > new Date()) return displayData()

    $('.display').hide()
    $('.loader').show()
    getData()
  })

  $('#history-submit').click(function () {
    $('.display-history').hide()
    $('#load-percentage').html('0 %')
    $('.loader').show()
    getData({ chart: true, days: daysBetween(historyStart, historyEnd) + 1, start: historyEnd })
  })

  $('#datepicker-start').change(function () {
    const value = datepickerStart.get('select', 'yyyy-mm-dd')
    if (!value) return

    const previousDate = historyStart
    historyStart = toDate(value)
    historyStart.setHours(6)

    if (sameDay(historyStart, previousDate) || historyStart > new Date()) return
    setHistoryDates()
  })
  $('#datepicker-end').change(function () {
    const value = datepickerEnd.get('select', 'yyyy-mm-dd')
    if (!value) return

    const previousDate = historyEnd
    historyEnd = toDate(value)
    historyEnd.setHours(6)
    setHistoryDates()

    if (sameDay(historyEnd, previousDate) || historyEnd > new Date()) return
    setHistoryDates()
  })

  $('#open-datepicker-today').click(function (event) {
    event.stopPropagation()
    datepickerToday.open()
  })
  $('#open-datepicker-start').click(function (event) {
    event.stopPropagation()
    datepickerStart.open()
  })
  $('#open-datepicker-end').click(function (event) {
    event.stopPropagation()
    datepickerEnd.open()
  })
})

function camelCaseToKebabCase (string) {
  return string.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

function defaultPreferences () {
  return {
    darkMode: false,
    game: 'coldWar'
  }
}

function generateFooterMessage () {
  return FOOTER_MESSAGES[Math.floor(Math.random() * FOOTER_MESSAGES.length)]
}

function toggleDarkMode () {
  darkMode = !darkMode

  if (darkMode) {
    $('body').addClass('dark-mode')
  } else {
    $('body').removeClass('dark-mode')
  }

  if (chart) {
    const color = darkMode ? '#ffffff' : '#000000'
    chart.setChartAttribute({
      baseFontColor: color,
      legendItemFontColor: color,
      trendlineColor: color
    })
  }
}
