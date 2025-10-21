// utils/helpers.js
const moment = require('moment');

const formatDate = (date) => {
  return moment(date).format('YYYY-MM-DD HH:mm:ss');
};

const calculateAge = (dateOfBirth) => {
  return moment().diff(moment(dateOfBirth), 'years');
};

const isToday = (date) => {
  return moment(date).isSame(moment(), 'day');
};

const getDayName = (date) => {
  return moment(date).format('dddd').toLowerCase();
};

module.exports = {
  formatDate,
  calculateAge,
  isToday,
  getDayName
};