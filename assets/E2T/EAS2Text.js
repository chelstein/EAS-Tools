/*
 * EAS2Text — convert SAME/EAS headers into human-friendly text. Originally in Python at https://github.com/Newton-Communications/E2T/.
 *
 */
const DEFAULT_FALLBACK_BASE = 'https://eas.tools/assets/E2T/';

const RESOURCE_MAP = {
  sameUS: {
    remote: 'https://github.com/Newton-Communications/E2T/blob/main/EAS2Text/same-us.json?raw=true',
    local: 'same-us.json'
  },
  sameCA: {
    remote: 'https://github.com/Newton-Communications/E2T/blob/main/EAS2Text/same-ca.json?raw=true',
    local: 'same-ca.json'
  },
  wfoUS: {
    remote: 'https://github.com/Newton-Communications/E2T/blob/main/EAS2Text/wfo-us.json?raw=true',
    local: 'wfo-us.json'
  },
  cclUS: {
    remote: 'https://github.com/Newton-Communications/E2T/blob/main/EAS2Text/CCL-us.json?raw=true',
    local: 'CCL-us.json'
  }
};

const cache = new Map();
let fallbackBaseURL = DEFAULT_FALLBACK_BASE;
const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
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
];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TONE_ALERT_MODES = new Set(['TFT']);
const TRILITHIC_MODES = new Set(['TRILITHIC', 'VIAVI', 'EASY']);
const BURK_MODES = new Set(['BURK']);
const DAS_MODES = new Set(['DAS', 'DASDEC', 'MONROE', 'ONENET', 'ONENET SE']);
const DAS_V3_MODES = new Set(['DASV3', 'DASDECV3', 'MONROEV3', 'ONENETV3', 'ONENET SEV3']);
const HOLLY_MODES = new Set([
  'HOLLYANNE',
  'HOLLY ANNE',
  'HOLLY-ANNE',
  'HU-961',
  'MIP-921',
  'MIP-921E',
  'HU961',
  'MIP921',
  'MIP921E'
]);
const GORMAN_MODES = new Set([
  'EAS1CG',
  'EAS-1',
  'EAS1',
  'EAS1-CG',
  'EAS-1CG',
  'GORMAN-REDLICH',
  'GORMANREDLICH',
  'GORMAN REDLICH'
]);

function normalizeBase(url) {
  if (!url) {
    return '';
  }
  return url.endsWith('/') ? url : `${url}/`;
}

async function fetchJSON(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Request to ${url} failed with status ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function tryFetch(url, timeoutMs) {
  try {
    return await fetchJSON(url, timeoutMs);
  } catch (err) {
    return null;
  }
}

async function loadJSONResource(key, { preferLocal = true, timeoutMs = 5000, fallbackBase = fallbackBaseURL } = {}) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const config = RESOURCE_MAP[key];
  if (!config) {
    throw new Error(`Unknown resource key: ${key}`);
  }

  const base = normalizeBase(fallbackBase);
  const fallbackURL = `${base}${config.local}`;

  let data = null;

  if (!preferLocal) {
    data = await tryFetch(config.remote, timeoutMs);
  }

  if (data == null) {
    data = await tryFetch(fallbackURL, timeoutMs);
  }

  if (data == null && preferLocal) {
    data = await tryFetch(config.remote, timeoutMs);
  }

  if (data == null) {
    throw new Error(`Unable to load resource ${key}`);
  }

  cache.set(key, data);
  return data;
}

async function loadAllResources(options) {
  const keys = Object.keys(RESOURCE_MAP);
  const results = await Promise.all(keys.map((key) => loadJSONResource(key, options)));
  return keys.reduce((acc, key, index) => {
    acc[key] = results[index];
    return acc;
  }, {});
}

function clearResourceCache() {
  cache.clear();
}

function setFallbackBaseURL(url) {
  fallbackBaseURL = normalizeBase(url || DEFAULT_FALLBACK_BASE);
}

function pad(value, length = 2) {
  const str = Math.abs(value).toString().padStart(length, '0');
  return value < 0 ? `-${str}` : str;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function formatDate(date, pattern) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  return pattern.replace(/%[A-Za-z]/g, (token) => {
    switch (token) {
      case '%I': {
        let hour = date.getHours() % 12;
        if (hour === 0) {
          hour = 12;
        }
        return pad(hour);
      }
      case '%H':
        return pad(date.getHours());
      case '%M':
        return pad(date.getMinutes());
      case '%p':
        return date.getHours() >= 12 ? 'PM' : 'AM';
      case '%B':
        return MONTH_NAMES[date.getMonth()];
      case '%b':
        return MONTH_NAMES[date.getMonth()].slice(0, 3);
      case '%a':
        return WEEKDAY_SHORT[date.getDay()];
      case '%m':
        return pad(date.getMonth() + 1);
      case '%y':
        return pad(date.getFullYear() % 100);
      case '%d':
        return pad(date.getDate());
      case '%Y':
        return date.getFullYear().toString();
      default:
        return token;
    }
  });
}

function parseJulianTimestamp(stamp, year) {
  if (!/^\d{7}$/.test(stamp)) {
    throw new InvalidSAME(stamp, 'Timestamp not JJJHHMM.');
  }
  const dayOfYear = parseInt(stamp.slice(0, 3), 10);
  const hour = parseInt(stamp.slice(3, 5), 10);
  const minute = parseInt(stamp.slice(5, 7), 10);
  if (Number.isNaN(dayOfYear) || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new InvalidSAME(stamp, 'Timestamp not JJJHHMM.');
  }
  const date = new Date(year, 0, 1, hour, minute, 0, 0);
  date.setDate(date.getDate() + (dayOfYear - 1));
  return date.getTime();
}

function splitPurge(value) {
  if (typeof value !== 'string' || value.length !== 4 || /\D/.test(value)) {
    throw new InvalidSAME(value, 'Purge Time not HHMM.');
  }
  return [value.slice(0, 2), value.slice(2)];
}

function purgeToSeconds(purgePair) {
  const hours = parseInt(purgePair[0], 10);
  const minutes = parseInt(purgePair[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new InvalidSAME(purgePair.join(''), 'Purge Time not HHMM.');
  }
  return hours * 3600 + minutes * 60;
}

function getOffsetFromTimeZoneName(tzName, referenceDate) {
  try {
    const baseDate =
      referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
        ? referenceDate
        : new Date();
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = dtf.formatToParts(baseDate).reduce((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
    const targetUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const diffHours = (targetUTC - baseDate.getTime()) / MS_PER_HOUR;
    return diffHours;
  } catch (err) {
    return null;
  }
}

function computeOffsetSeconds({ timeZone, timeZoneName, useLocaleTimezone, referenceDate }) {
  if (typeof timeZone === 'number' && Number.isFinite(timeZone)) {
    return -timeZone * 3600;
  }

  if (typeof timeZoneName === 'string' && timeZoneName.trim()) {
    const offsetHours = getOffsetFromTimeZoneName(timeZoneName.trim(), referenceDate);
    if (typeof offsetHours === 'number' && Number.isFinite(offsetHours)) {
      return -offsetHours * 3600;
    }
  }

  if (useLocaleTimezone) {
    const baseDate =
      referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
        ? referenceDate
        : new Date();
    const minutes = baseDate.getTimezoneOffset();
    const offsetHours = -minutes / 60;
    return -offsetHours * 3600;
  }

  return 0;
}

function formatHourNoPad(date) {
  let hour = date.getHours() % 12;
  if (hour === 0) {
    hour = 12;
  }
  return hour.toString();
}

function formatAmPm(date) {
  return date.getHours() >= 12 ? 'PM' : 'AM';
}

function stripTrailingSemicolon(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.endsWith(';') ? value.slice(0, -1) : value;
}

class InvalidSAME extends Error {
  constructor(error, message = 'Invalid Data in SAME Message') {
    super(`${message}: ${error}`);
    this.name = 'InvalidSAME';
    this.error = error;
  }
}

class MissingSAME extends Error {
  constructor(message = 'Missing SAME Message') {
    super(message);
    this.name = 'MissingSAME';
  }
}

class EAS2Text {
  #cclIndex;

  static async fromUSMessage(sameData, options = {}) {
    const resources = options.resources || (await loadAllResources(options.loaderOptions));
    return new EAS2Text(sameData, { ...options, resources, canada: false });
  }

  static async fromCanadaMessage(sameData, options = {}) {
    const resources = options.resources || (await loadAllResources(options.loaderOptions));
    return new EAS2Text(sameData, { ...options, resources, canada: true });
  }

  static getTZ(offsetSeconds, options = {}) {
    const { timeZoneName, referenceDate } = options;
    if (typeof timeZoneName === 'string' && timeZoneName.trim()) {
      const safeDate =
        referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
          ? referenceDate
          : new Date();
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timeZoneName.trim(),
          timeZoneName: 'short'
        });
        const tzPart = formatter
          .formatToParts(safeDate)
          .find((part) => part.type === 'timeZoneName');
        if (tzPart && tzPart.value) {
          return tzPart.value.replace('GMT', 'UTC');
        }
      } catch (error) {
        // Fallback to offset-based logic below when Intl lookup fails.
      }
    }
    const hours = Math.round(offsetSeconds / 3600);
    const dst = (() => {
      const now = new Date();
      const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
      const jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
      return Math.min(jan, jul) !== now.getTimezoneOffset();
    })();
    if (hours === 3) {
      return dst ? 'ADT' : 'AST';
    }
    if (hours === 4) {
      return dst ? 'EDT' : 'EST';
    }
    if (hours === 5) {
      return dst ? 'CDT' : 'CST';
    }
    if (hours === 6) {
      return dst ? 'MDT' : 'MST';
    }
    if (hours === 7) {
      return dst ? 'PDT' : 'PST';
    }
    if (hours === 8) {
      return dst ? 'AKDT' : 'AKST';
    }
    if (hours === 9) {
      return 'HST';
    }
    return 'UTC';
  }

  constructor(
    sameData,
    {
      newWFO = false,
      resources,
      timeZone = null,
      timeZoneName = null,
      useLocaleTimezone = false,
      mode = 'NONE',
      canada = false
    } = {}
  ) {
    if (!resources) {
      throw new Error('EAS2Text requires SAME/WFO resources. Pass preloaded data or call fromUSMessage().');
    }

    this.raw = (sameData || '').trim();
    this.newWFO = Boolean(newWFO);
    this.resources = resources;
    this.canada = Boolean(canada);
    const statsKey = this.canada ? 'sameCA' : 'sameUS';
    this.stats = resources[statsKey];
    if (!this.stats) {
      throw new Error(`Missing resource data for ${statsKey}`);
    }
    this.EASData = this.raw;
    this.region = this.canada ? 'CA' : 'US';
    this.timeZone = timeZone;
    this.timeZoneName = timeZoneName;
    this.useLocaleTimezone = Boolean(useLocaleTimezone);
    this.mode = mode || 'NONE';

    if (!this.#validateSame()) {
      return;
    }

    this.easParts = this.#parseSame();
    this.org = this.easParts[0];
    this.evnt = this.easParts[1];

    this.#collectFips();
    this.#decodeOrgEvent();
    this.callsign = this.easParts[this.easParts.length - 1].trim();
    this.#computeTimes();

    if (this.canada) {
      this.#processCanada();
    } else if (this.newWFO) {
      this.#processUnitedStatesNew();
    } else {
      this.#processUnitedStatesOld();
    }

    this.#buildText();
  }

  #computeTimes() {
    const purgeRaw = this.easParts[this.easParts.length - 3];
    const timestampRaw = this.easParts[this.easParts.length - 2];

    this.purge = splitPurge(purgeRaw);
    this.timeStamp = timestampRaw;

    const utcNow = new Date();
    const alertStartMillis = parseJulianTimestamp(this.timeStamp, utcNow.getUTCFullYear());
    const purgeSeconds = purgeToSeconds(this.purge);
    const alertEndMillis = alertStartMillis + purgeSeconds * 1000;
    const referenceDate = new Date(alertStartMillis);

    const dtOffset = computeOffsetSeconds({
      timeZone: this.timeZone,
      timeZoneName: this.timeZoneName,
      useLocaleTimezone: this.useLocaleTimezone,
      referenceDate
    });
    this.dtOffset = dtOffset;

    this.startTime = new Date(alertStartMillis - dtOffset * 1000);
    this.endTime = new Date(alertEndMillis - dtOffset * 1000);
    this.alertStartEpoch = Math.floor(alertStartMillis / 1000);
    this.alertEndEpoch = Math.floor(alertEndMillis / 1000);

    this.#setDefaultTimeText();
  }

  #setDefaultTimeText() {
    if (!this.startTime || !this.endTime) {
      this.startTimeText = '';
      this.endTimeText = '';
      return;
    }
    const sameDay =
      this.startTime.getFullYear() === this.endTime.getFullYear() &&
      this.startTime.getMonth() === this.endTime.getMonth() &&
      this.startTime.getDate() === this.endTime.getDate();

    if (sameDay) {
      this.startTimeText = formatDate(this.startTime, '%I:%M %p');
      this.endTimeText = formatDate(this.endTime, '%I:%M %p');
      return;
    }

    if (this.startTime.getFullYear() === this.endTime.getFullYear()) {
      this.startTimeText = formatDate(this.startTime, '%I:%M %p %B %d');
      this.endTimeText = formatDate(this.endTime, '%I:%M %p %B %d');
      return;
    }

    this.startTimeText = formatDate(this.startTime, '%I:%M %p %B %d, %Y');
    this.endTimeText = formatDate(this.endTime, '%I:%M %p %B %d, %Y');
  }

  #validateSame() {
    if (!this.raw) {
      throw new MissingSAME();
    }
    if (this.raw.startsWith('NNNN')) {
      this.EASText = 'End Of Message';
      return false;
    }
    if (!this.raw.startsWith('ZCZC')) {
      throw new InvalidSAME(this.raw, '"ZCZC" Start string missing');
    }
    return true;
  }

  #parseSame() {
    const stripped = this.raw.replace('ZCZC-', '').replace(/\+/g, '-');
    return stripped.split('-').filter(Boolean);
  }

  #collectFips() {
    if (!this.stats) {
      throw new Error('Missing SAME stats');
    }
    const fipsCodes = this.easParts.slice(2, -3);
    this.FIPS = [];
    this.FIPSText = [];

    for (const code of fipsCodes) {
      if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        throw new InvalidSAME('Invalid codes in FIPS data');
      }
      if (!this.FIPS.includes(code)) {
        this.FIPS.push(code);
      }
    }

    this.FIPS.sort();
    for (const code of this.FIPS) {
      try {
        const subdiv = this.stats.SUBDIV[code[0]];
        const same = this.stats.SAME[code.slice(1)];
        this.FIPSText.push(`${subdiv ? `${subdiv} ` : ''}${same}`);
      } catch (err) {
        this.FIPSText.push(`FIPS Code ${code}`);
      }
    }

    if (this.FIPSText.length > 1) {
      const copy = [...this.FIPSText];
      copy[copy.length - 1] = `and ${copy[copy.length - 1]}`;
      this.strFIPS = `${copy.join('; ').trim()};`;
    } else {
      this.strFIPS = `${this.FIPSText.join('; ').trim()};`;
    }
  }

  #decodeOrgEvent() {
    if (!this.org || this.org.length !== 3) {
      throw new InvalidSAME('Originator is an invalid length');
    }
    if (!this.evnt || this.evnt.length !== 3) {
      throw new InvalidSAME('Event Code is an invalid length');
    }
    this.orgText = this.stats.ORGS[this.org] || `An Unknown Originator (${this.org});`;
    this.evntText = this.stats.EVENTS[this.evnt] || `an Unknown Event (${this.evnt})`;
  }

  #processUnitedStatesOld() {
    const originator = this.easParts[0];
    const wfoData = this.resources.wfoUS;
    this.WFO = [];
    this.WFOText = [];
    this.StateInSAME = false;

    for (const code of this.FIPS) {
      try {
        const same = this.stats.SAME[code.slice(1)];
        if (originator === 'WXR' && !same.includes('State')) {
          const entry = wfoData.SAME[code.slice(1)]?.[0];
          const wfo = entry?.wfo;
          if (wfo) {
            this.WFO.push(wfo);
            this.WFOText.push(wfo);
          } else {
            this.#pushUnknownWfo(code);
          }
        } else if (same.includes('State')) {
          this.StateInSAME = true;
        }
      } catch (err) {
        this.#pushUnknownWfo(code);
      }
    }

    if (!this.WFO.length) {
      this.WFO = ['Unknown WFO'];
      this.WFOText = ['Unknown WFO'];
    }

    this.#finalizeWfoLists({ originator, respectStateFlag: true });
  }

  #processUnitedStatesNew() {
    const originator = this.easParts[0];
    const parsedCCL = this.#buildCCLIndex();
    this.WFO = [];
    this.WFOText = [];
    this.WFOForecastOffice = [];
    this.WFOAddress = [];
    this.WFOCallsign = [];
    this.WFOPhoneNumber = [];
    this.NWR_FREQ = [];
    this.NWR_CALLSIGN = [];
    this.NWR_PWR = [];
    this.NWR_SITENAME = [];
    this.NWR_SITELOC = [];
    this.NWR_SITESTATE = [];
    this.NWR_SITE = [];
    this.NWR_COORDINATES = [];

    for (const code of this.FIPS) {
      try {
        const same = this.stats.SAME[code.slice(1)];
        if (originator === 'WXR' && !same.includes('State')) {
          const info = parsedCCL.data[code.slice(1)];
          if (info) {
            for (const wfo of info.WFOs) {
              const label = `${wfo.Forecast_office}, ${wfo.State} (${wfo.Office_call_sign})`;
              this.WFO.push(label);
              this.WFOText.push(label);
              this.WFOForecastOffice.push(wfo.Forecast_office);
              this.WFOAddress.push(wfo.Address);
              this.WFOCallsign.push(wfo.Office_call_sign);
              this.WFOPhoneNumber.push(wfo.Phone_number);
              this.NWR_FREQ.push(info.NWR_FREQ);
              this.NWR_CALLSIGN.push(info.NWR_CALLSIGN);
              this.NWR_PWR.push(info.NWR_PWR);
              this.NWR_SITENAME.push(info.NWR_SITENAME);
              this.NWR_SITELOC.push(info.NWR_SITELOC);
              this.NWR_SITESTATE.push(info.NWR_SITESTATE);
              this.NWR_SITE.push(info.NWR_SITE);
              this.NWR_COORDINATES.push(info.NWR_COORDINATES);
            }
          } else {
            this.#pushFallbackWfo(code);
          }
        }
      } catch (err) {
        this.#pushUnknownWfo(code);
      }
    }

    this.#finalizeWfoLists({ originator, respectStateFlag: false });
  }

  #processCanada() {
    this.WFO = [];
    this.WFOText = [];
  }

  #buildCCLIndex() {
    if (this.#cclIndex) {
      return this.#cclIndex;
    }
    const ccl = this.resources.cclUS;
    const parsedData = {};
    const getWfoDetails = (wfoId) => {
      const details = ccl.WFOs[wfoId];
      if (!details || !details.length) {
        return null;
      }
      return {
        Forecast_office: details[0].Forecast_office,
        State: details[0].State,
        Office_call_sign: details[0].Office_call_sign,
        Address: details[0].Address,
        Phone_number: details[0].PNum
      };
    };

    for (const [fipsCode, entries] of Object.entries(ccl.SAME)) {
      const wfoList = [];
      const seenWfo = new Set();
      const freqSet = new Set();
      const siteSet = new Set();
      const coordSet = new Set();
      const nwrFreq = [];
      const nwrCallsign = [];
      const nwrPwr = [];
      const nwrSiteName = [];
      const nwrSiteLoc = [];
      const nwrSiteState = [];
      const nwrSite = [];
      const coords = [];

      for (const entry of entries) {
        const wfoDetails = getWfoDetails(entry.WFO);
        if (wfoDetails) {
          const key = `${wfoDetails.Forecast_office}|${wfoDetails.State}|${wfoDetails.Office_call_sign}`;
          if (!seenWfo.has(key)) {
            seenWfo.add(key);
            wfoList.push(wfoDetails);
          }
        }

        const freqKey = `${entry.FREQ}|${entry.CALLSIGN}|${entry.PWR}`;
        if (!freqSet.has(freqKey)) {
          freqSet.add(freqKey);
          nwrFreq.push(entry.FREQ);
          nwrCallsign.push(entry.CALLSIGN);
          nwrPwr.push(entry.PWR);
        }

        const siteKey = `${entry.SITENAME}|${entry.SITELOC}|${entry.SITESTATE}`;
        if (!siteSet.has(siteKey)) {
          siteSet.add(siteKey);
          nwrSiteName.push(entry.SITENAME);
          nwrSiteLoc.push(entry.SITELOC);
          nwrSiteState.push(entry.SITESTATE);
          nwrSite.push(`${entry.SITENAME}, ${entry.SITESTATE} (${entry.SITELOC})`);
        }

        const coordKey = `${entry.LAT}|${entry.LON}`;
        if (!coordSet.has(coordKey)) {
          coordSet.add(coordKey);
          coords.push(`${entry.LAT}, ${entry.LON}`);
        }
      }

      parsedData[fipsCode] = {
        WFOs: wfoList,
        NWR_FREQ: nwrFreq.join('; '),
        NWR_CALLSIGN: nwrCallsign.join('; '),
        NWR_PWR: nwrPwr.join('; '),
        NWR_SITENAME: nwrSiteName.join('; '),
        NWR_SITELOC: nwrSiteLoc.join('; '),
        NWR_SITESTATE: nwrSiteState.join('; '),
        NWR_SITE: nwrSite.join('; '),
        NWR_COORDINATES: coords.join('; ')
      };
    }

    this.#cclIndex = { data: parsedData };
    return this.#cclIndex;
  }

  #pushUnknownWfo(code) {
    const label = `Unknown WFO for FIPS Code ${code}`;
    this.WFO.push(label);
    this.WFOText.push(label);
  }

  #pushFallbackWfo(code) {
    const fallback = this.resources.wfoUS.SAME[code.slice(1)]?.[0]?.wfo;
    if (fallback) {
      this.WFO.push(fallback);
      this.WFOText.push(fallback);
    } else {
      this.#pushUnknownWfo(code);
    }
  }

  #finalizeWfoLists({ originator, respectStateFlag }) {
    if (originator !== 'WXR') {
      return;
    }

    const formatList = (list) => {
      if (!Array.isArray(list) || !list.length) {
        return 'Unknown WFO;';
      }
      if (respectStateFlag && this.StateInSAME) {
        return 'Unknown WFO;';
      }
      const unique = [...new Set(list)];
      if (unique.length > 1) {
        unique[unique.length - 1] = `and ${unique[unique.length - 1]}`;
      }
      return `${unique.join('; ').trim()};`;
    };

    this.WFOText = formatList(this.WFOText);
    this.WFO = formatList(this.WFO);
  }

  #buildText() {
    const mode = (this.mode || '').toUpperCase();
    if (TONE_ALERT_MODES.has(mode)) {
      this.#formatTFT();
      return;
    }
    if (mode.startsWith('SAGE')) {
      this.#formatSage(mode);
      return;
    }
    if (TRILITHIC_MODES.has(mode)) {
      this.#formatTrilithic();
      return;
    }
    if (BURK_MODES.has(mode)) {
      this.#formatBurk();
      return;
    }
    if (DAS_MODES.has(mode)) {
      this.#formatDasFamily({ uppercase: true, onUpper: true });
      return;
    }
    if (DAS_V3_MODES.has(mode)) {
      this.#formatDasFamily({ uppercase: true, onUpper: false });
      return;
    }
    if (HOLLY_MODES.has(mode)) {
      this.#formatHollyAnne();
      return;
    }
    if (GORMAN_MODES.has(mode)) {
      this.#formatGorman();
      return;
    }
    this.#formatDefault();
  }

  #formatDefault() {
    let orgText = this.orgText;
    if (this.canada && this.org === 'CIV') {
      orgText = 'The Civil Authorities';
    }
    if (!this.canada && this.org === 'WXR') {
      if (typeof this.WFOText === 'string' && this.WFOText !== 'Unknown WFO;' && !this.StateInSAME) {
        orgText = `The National Weather Service in ${this.WFOText.replace(/;$/, '')}`;
      } else {
        orgText = 'The National Weather Service';
      }
    } else if (this.canada && this.org === 'WXR') {
      orgText = 'Environment Canada';
    }
    this.EASText = `${orgText} has issued ${this.evntText} for ${this.strFIPS} beginning at ${this.startTimeText} and ending at ${this.endTimeText}. Message from ${this.callsign}.`;
  }

  #formatTFT() {
    const sameDay =
      this.startTime.getFullYear() === this.endTime.getFullYear() &&
      this.startTime.getMonth() === this.endTime.getMonth() &&
      this.startTime.getDate() === this.endTime.getDate();
    const strFips = stripTrailingSemicolon(this.strFIPS)
      .replace(/,/g, '')
      .replace(/;/g, ',')
      .replace(/FIPS Code/gi, 'AREA');
    const startLabel = formatDate(this.startTime, '%I:%M %p ON %b %d, %Y');
    const endLabel = sameDay
      ? formatDate(this.endTime, '%I:%M %p')
      : formatDate(this.endTime, '%I:%M %p ON %b %d, %Y');
    const prefix = this.org === 'EAS' || ['NPT', 'EAN'].includes(this.evnt)
      ? `${this.evntText} has been issued`
      : `${this.orgText} has issued ${this.evntText}`;
    this.EASText = `${prefix} for the following counties/areas: ${strFips} at ${startLabel} effective until ${endLabel}. message from ${this.callsign}.`.toUpperCase();
    this.startTimeText = startLabel;
    this.endTimeText = endLabel;
  }

  #formatSage(mode) {
    let orgText = this.orgText;
    if (this.org === 'CIV') {
      orgText = 'The Civil Authorities';
    } else if (!mode.endsWith('DIGITAL') && this.org === 'EAS') {
      orgText = 'A Broadcast station or cable system';
    }
    const fields = stripTrailingSemicolon(this.strFIPS).replace(/;/g, ',');
    let startLabel = formatDate(this.startTime, '%I:%M %p').toLowerCase();
    let endLabel = formatDate(this.endTime, '%I:%M %p').toLowerCase();
    const sameDay =
      this.startTime.getFullYear() === this.endTime.getFullYear() &&
      this.startTime.getMonth() === this.endTime.getMonth() &&
      this.startTime.getDate() === this.endTime.getDate();
    if (!sameDay) {
      startLabel += ` ${formatDate(this.startTime, '%a %b %d').toLowerCase()}`;
      endLabel += ` ${formatDate(this.endTime, '%a %b %d').toLowerCase()}`;
    }
    const verb = this.org === 'CIV' ? 'have' : 'has';
    this.EASText = `${orgText} ${verb} issued ${this.evntText} for ${fields} beginning at ${startLabel} and ending at ${endLabel} (${this.callsign})`;
    this.startTimeText = startLabel;
    this.endTimeText = endLabel;
  }

  #formatTrilithic() {
    const processLocation = (text, citySuffix = ' (city)') => {
      let value = text;
      if (value.startsWith('City of')) {
        value = value.replace('City of', '') + citySuffix;
      }
      if (value.startsWith('State of')) {
        value = value.replace('State of', 'All of');
      }
      if (value.startsWith('District of')) {
        value = value.replace('District of', 'All of District of');
      }
      if (value.includes(' City of')) {
        value = value.replace(' City of', '') + citySuffix;
      }
      if (value.includes(' State of') && !value.includes('All of')) {
        value = value.replace(' State of', ' All of');
      }
      if (value.includes(' District of') && !value.includes('All of')) {
        value = value.replace(' District of', ' All of District of');
      }
      if (value.includes(' County')) {
        value = value.replace(' County', '');
      }
      if (value.startsWith('and ')) {
        value = value.replace('and ', '');
      }
      if (value.includes('; ')) {
        value = value.replace(/; /g, ' - ');
      }
      return value.trim();
    };

    const filterLocation = (text) => {
      let value = text;
      if (value.startsWith('City of')) {
        value = value.replace('City of ', '') + ' (city)';
      }
      if (value.startsWith('State of')) {
        value = value.replace('State of', 'All of');
      }
      if (value.startsWith('District of')) {
        value = value.replace('District of', 'All of District of');
      }
      if (value.includes(' City of')) {
        value = value.replace(' City of', '') + ' (city)';
      }
      if (value.includes(' State of') && !value.includes('All of')) {
        value = value.replace(' State of', ' All of');
      }
      if (value.includes(' District of') && !value.includes('All of')) {
        value = value.replace(' District of', ' All of District of');
      }
      if (value.includes(' County')) {
        value = value.replace(' County', '');
      }
      if (value.startsWith('and ')) {
        value = value.replace('and ', '');
      }
      return value.trim();
    };

    const strValue = stripTrailingSemicolon(this.strFIPS);
    const areaToken = this.FIPS.includes('000000')
      ? 'Canada'
      : strValue
          .split(', ')
          .filter(Boolean)
          .map((entry) => processLocation(entry))
          .join(', ')
          .replace(/,/g, '')
          .replace(/ and/g, '');

    const formatted = this.FIPSText.map((entry) => {
      const parts = entry.split(', ');
      if (parts.length === 1) {
        return filterLocation(parts[0]);
      }
      if (parts.length === 2) {
        return `${filterLocation(parts[0])} ${parts[1]}`;
      }
      return `${filterLocation(parts.slice(0, -1).join(' '))} ${parts[parts.length - 1]}`;
    });
    this.FIPSText = formatted;

    const descriptor = areaToken === 'Canada' ? 'for' : 'for the following counties:';
    this.startTimeText = '';
    this.endTimeText = `${formatDate(this.endTime, '%m/%d/%y %H:%M:00')} ${EAS2Text.getTZ(this.dtOffset || 0, {
      timeZoneName: this.timeZoneName,
      referenceDate: this.endTime || this.startTime
    })}`;
    const orgText = this.org === 'CIV' ? 'The Civil Authorities' : this.orgText;
    const verb = this.org === 'CIV' ? 'have' : 'has';
    this.EASText = `${orgText} ${verb} issued ${this.evntText} ${descriptor} ${formatted.join(', ')}. Effective Until ${this.endTimeText}. (${this.callsign})`;
  }

  #formatBurk() {
    let orgText = this.orgText;
    if (this.org === 'EAS') {
      orgText = 'A Broadcast station or cable system';
    } else if (this.org === 'CIV') {
      orgText = 'The Civil Authorities';
    } else if (this.org === 'WXR') {
      orgText = this.canada ? 'Environment Canada' : 'The National Weather Service';
    }
    const areas = stripTrailingSemicolon(this.strFIPS).replace(/,/g, '').replace(/;/g, ',');
    const startLabel = `${formatDate(this.startTime, '%B %d, %Y').toUpperCase()} AT ${formatDate(this.startTime, '%I:%M %p')}`;
    const endLabel = formatDate(this.endTime, '%I:%M %p, %B %d, %Y').toUpperCase();
    const event = this.evntText.split(' ').slice(1).join(' ').toUpperCase() || this.evntText.toUpperCase();
    this.EASText = `${orgText} has issued ${event} for the following counties/areas: ${areas} on ${startLabel} effective until ${endLabel}.`;
    this.startTimeText = startLabel;
    this.endTimeText = endLabel;
  }

  #formatDasFamily({ uppercase, onUpper }) {
    let orgText = this.orgText;
    if (this.org === 'EAS') {
      orgText = 'A broadcast or cable system';
    } else if (this.org === 'CIV') {
      orgText = 'A civil authority';
    } else if (this.org === 'WXR') {
      orgText = 'The National Weather Service';
    } else if (this.org === 'PEP') {
      orgText = 'THE PRIMARY ENTRY POINT EAS SYSTEM';
    }
    if (uppercase) {
      orgText = orgText.toUpperCase();
    }
    const eventText = uppercase ? this.evntText.toUpperCase() : this.evntText;
    const { text, onlyParishes } = this.#processFipsForDas();
    const formattedFipsRaw = uppercase ? text.toUpperCase() : text;
    const formattedFips = formattedFipsRaw && formattedFipsRaw.trim() ? formattedFipsRaw : 'UNKNOWN;';
    const hour = formatHourNoPad(this.startTime);
    const minute = pad(this.startTime.getMinutes());
    const endHour = formatHourNoPad(this.endTime);
    const endMinute = pad(this.endTime.getMinutes());
    const startSuffix = formatDate(this.startTime, ' %b %d, %Y');
    const endSuffix = formatDate(this.endTime, ' %b %d, %Y');
    const sameDay =
      this.startTime.getFullYear() === this.endTime.getFullYear() &&
      this.startTime.getMonth() === this.endTime.getMonth() &&
      this.startTime.getDate() === this.endTime.getDate();
    const startRaw = `${hour}:${minute} ${formatAmPm(this.startTime)} ${onUpper ? 'ON' : 'on'}${startSuffix}`;
    const endRaw = sameDay
      ? `${endHour}:${endMinute} ${formatAmPm(this.endTime)}`
      : `${endHour}:${endMinute} ${formatAmPm(this.endTime)}${endSuffix}`;
    const startLabel = uppercase ? startRaw.toUpperCase() : startRaw;
    const endLabel = uppercase ? endRaw.toUpperCase() : endRaw;
    this.EASText = `${orgText} has issued ${eventText} for the following ${onlyParishes ? 'areas' : 'counties/areas'}: ${formattedFips} at ${startLabel} Effective until ${endLabel}. Message from ${this.callsign}.`;
    this.startTimeText = startLabel;
    this.endTimeText = endLabel;
  }

  #processFipsForDas() {
    const parts = this.strFIPS
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);
    const result = [];
    const states = {};
    let onlyParishes = true;
    for (const part of parts) {
      const cleaned = part.replace(/^\s*and\s+/i, '');
      const match = cleaned.match(/(City of )?(.*?)( County| Parish)?, (\w{2})/);
      const stateMatch = cleaned.match(/State of (.+)/);
      if (match) {
        const [, cityPrefix, name, locality, state] = match;
        let cleanName = name;
        if (locality === ' Parish') {
          // keep parish flag
        } else if (cityPrefix) {
          cleanName += ' (city)';
          onlyParishes = false;
        } else {
          onlyParishes = false;
        }
        if (!states[state]) {
          states[state] = [];
        }
        states[state].push(cleanName);
      } else if (stateMatch) {
        result.push(stateMatch[1]);
      }
    }

    for (const [state, entries] of Object.entries(states)) {
      entries.forEach((name, idx) => {
        if (idx === entries.length - 1) {
          result.push(`${name}, ${state}`);
        } else {
          result.push(name);
        }
      });
    }

    let finalText = result.join('; ').replace(/ and /g, ' ');
    finalText = finalText.replace(/City of (.*?)( \(city\))?,/g, '$1 (city),');
    return { text: `${finalText};`, onlyParishes };
  }

  #formatHollyAnne() {
    if (this.org === 'EAS') {
      this.orgText = 'CABLE/BROADCAST SYSTEM';
    } else if (this.org === 'CIV') {
      this.orgText = 'AUTHORITIES';
    } else if (this.org === 'WXR') {
      this.orgText = this.canada ? 'ENVIRONMENT CANADA' : 'NATIONAL WEATHER SERVICE';
    }
    const filterLocation = (text) => {
      let value = text;
      if (value.startsWith('City of')) {
        value = value.replace('City of ', '') + ' CITY';
      }
      if (value.startsWith('State of')) {
        value = value.replace('State of', '');
      }
      if (value.includes(' City of')) {
        value = value.replace(' City of', '') + ' CITY';
      }
      if (value.includes(' State of') && !value.includes('All of')) {
        value = value.replace(' State of', '');
      }
      if (value.includes(' County')) {
        value = value.replace(' County', '');
      }
      if (value.startsWith('and ')) {
        value = value.replace('and ', 'AND ');
      }
      return value;
    };

    const states = new Set();
    for (const entry of this.FIPSText) {
      const parts = entry.split(', ');
      if (parts.length > 1) {
        states.add(parts[parts.length - 1]);
      }
    }

    const formatted = this.FIPSText.map((entry) => {
      const parts = entry.split(', ');
      if (parts.length === 2) {
        const location = filterLocation(parts[0]).toUpperCase();
        const state = parts[1].toUpperCase();
        return states.size === 1 ? location : `${location} ${state}`;
      }
      if (parts.length > 2) {
        return `${filterLocation(parts.slice(0, -1).join(' ')).toUpperCase()} ${parts[parts.length - 1].toUpperCase()}`;
      }
      return filterLocation(parts[0]).toUpperCase();
    });

    this.FIPSText = formatted;
    this.strFIPS = formatted.join(', ').trim();
    if (this.strFIPS.includes(', AND ')) {
      this.strFIPS = this.strFIPS.replace(', AND ', ' AND ');
    }
    this.startTimeText = this.startTimeText.toUpperCase();
    this.endTimeText = this.endTimeText.toUpperCase();
    this.EASText = `${this.evntText.toUpperCase()} HAS BEEN ISSUED FOR ${this.strFIPS} AT ${this.startTimeText} EFFECTIVE UNTIL ${this.endTimeText}. MESSAGE FROM ${this.callsign}.`;
  }

  #formatGorman() {
    const filterLocation = (text) => {
      let value = text;
      if (value.startsWith('City of')) {
        value = value.replace('City of ', '') + ' CITY';
      }
      if (value.startsWith('State of')) {
        value = value.replace('State of', '');
      }
      if (value.includes(' City of')) {
        value = value.replace(' City of', '') + ' CITY';
      }
      if (value.includes(' State of') && !value.includes('All of')) {
        value = value.replace(' State of', '');
      }
      if (value.includes(' County')) {
        value = value.replace(' County', '');
      }
      if (value.startsWith('and ')) {
        value = value.replace('and ', 'AND ');
      }
      return value;
    };

    const states = new Set();
    for (const entry of this.FIPSText) {
      const parts = entry.split(', ');
      if (parts.length > 1) {
        states.add(parts[parts.length - 1]);
      }
    }

    const formatted = this.FIPSText.map((entry) => {
      const parts = entry.split(', ');
      if (parts.length === 2) {
        const loc = filterLocation(parts[0]).toUpperCase();
        const st = parts[1].toUpperCase();
        return states.size === 1 ? loc : `${loc} ${st}`;
      }
      if (parts.length > 2) {
        return `${filterLocation(parts.slice(0, -1).join(' ')).toUpperCase()} ${parts[parts.length - 1].toUpperCase()}`;
      }
      return filterLocation(parts[0]).toUpperCase();
    });

    this.FIPSText = formatted;
    this.strFIPS = formatted.join(', ').trim();
    if (this.strFIPS.includes(', AND ')) {
      this.strFIPS = this.strFIPS.replace(', AND ', ' AND ');
    }
    const startLabel = formatDate(this.startTime, '%I:%M %p ON %B %d, %Y').toUpperCase();
    const sameDay =
      this.startTime.getFullYear() === this.endTime.getFullYear() &&
      this.startTime.getMonth() === this.endTime.getMonth() &&
      this.startTime.getDate() === this.endTime.getDate();
    const endLabel = sameDay
      ? formatDate(this.endTime, '%I:%M %p').toUpperCase()
      : formatDate(this.endTime, '%I:%M %p ON %B %d, %Y').toUpperCase();
    this.startTimeText = startLabel;
    this.endTimeText = endLabel;
    this.EASText = `${this.orgText.toUpperCase()} HAS ISSUED ${this.evntText.toUpperCase()} FOR THE FOLLOWING COUNTIES: ${this.strFIPS} BEGINNING AT ${this.startTimeText} AND ENDING AT ${this.endTimeText}. MESSAGE FROM ${this.callsign}.`;
  }
}

export {
  loadJSONResource,
  loadAllResources,
  clearResourceCache,
  setFallbackBaseURL,
  RESOURCE_MAP,
  EAS2Text,
  InvalidSAME,
  MissingSAME
};

const EAS2TextModule = {
  loadJSONResource,
  loadAllResources,
  clearResourceCache,
  setFallbackBaseURL,
  RESOURCE_MAP,
  EAS2Text,
  InvalidSAME,
  MissingSAME
};

const globalRef = typeof globalThis !== 'undefined' ? globalThis : undefined;
if (globalRef) {
  if (!globalRef.EAS2TextModulePromise) {
    let resolver;
    globalRef.EAS2TextModulePromise = new Promise((resolve) => {
      resolver = resolve;
    });
    globalRef.__EAS2TextModuleResolver__ = resolver;
  }
  globalRef.EAS2TextModule = EAS2TextModule;
  if (globalRef.__EAS2TextModuleResolver__) {
    globalRef.__EAS2TextModuleResolver__(EAS2TextModule);
    delete globalRef.__EAS2TextModuleResolver__;
  } else {
    globalRef.EAS2TextModulePromise = Promise.resolve(EAS2TextModule);
  }
  if (typeof globalRef.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    try {
      globalRef.dispatchEvent(new CustomEvent('EAS2TextModuleReady', { detail: EAS2TextModule }));
    } catch (err) {
      // ignore
    }
  }
}

export default EAS2TextModule;
