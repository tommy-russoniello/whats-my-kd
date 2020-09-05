DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
]
MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
]

function prettyDateString(date) {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ` +
    `${date.getDate()}, ${date.getFullYear()}`
}

function toDate(string) {
  values = string.split('-');
  return new Date(values[0], parseInt(values[1]) - 1, values[2]);
}
