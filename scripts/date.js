/* eslint no-unused-vars: 0 */

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

function daysBetween (startDate, endDate) {
  return Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))
}

function numericDateString (date) {
  return date.toJSON().slice(0, 10).replace(/-/g, '')
}

function prettyDateString (date) {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ` +
    `${date.getDate()}, ${date.getFullYear()}`
}

function sameDay (first, second) {
  return first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
}

function shortDateString (date) {
  return `${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getDate()}`
}

function shortPrettyDateString (date) {
  return `${DAY_NAMES[date.getDay()].slice(0, 3)}, ${MONTH_NAMES[date.getMonth()].slice(0, 3)} ` +
    `${date.getDate()}, ${date.getFullYear()}`
}

function toDate (string) {
  const values = string.split('-')
  return new Date(values[0], parseInt(values[1]) - 1, values[2])
}
