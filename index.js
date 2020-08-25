'use strict';
var CryptoJS = require('crypto-js');
var HTMLParser = require('node-html-parser');
var request = require('request-promise');
var pollingtoevent = require("polling-to-event");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_NO_WARNINGS = '1';

let Service, Characteristic;

var protocol = "https";
var apibasepath = "/system_http_api/API_REV01";
var hPath = "API_REV01";

let CurrentState = 3;
let TargetState = 3;
var api_key_enc;
var api_iv_enc;

var alarmStatus = {
  'Armed Stay'       : 0,
  'Armed Away'       : 1,
  'Armed Night'      : 2,
  'Armed Night Fault': 2,
  'Ready To Arm'     : 3,
  'Not Ready Fault'  : 3,
  'Not Ready Alarm'  : 4,
  'Armed Stay Alarm' : 4,
  'Armed Night Alarm': 4,
  'Armed Away Alarm' : 4,
  'Error' : 3 // Tuxedo api can be tempramental at times, when the API call fails, it's better to assume a disarmed state than not to.
};

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-honeywell-tuxedo-touch', 'Honeywell Tuxedo Touch', HoneywellTuxedoAccessory);
};

function HoneywellTuxedoAccessory(log, config) {
      this.log = log;
      this.config = config;
      this.debug = config.debug || false;
      this.polling = config.polling || false;
      this.pollInterval = config.pollInterval || 30000;

      // extract name from config
      this.name = config.name || "Honeywell Tuxedo Security";

      this.host = config.host;
      this.port = config.port || "";

      if(!config.alarmCode){
        this.log("Alarm code is missing from config");
      }
      this.uCode = config.alarmCode;

      // Get API Keys from the tuxedo unit
      // Create an API request with the cookie jar turned on
      request = request.defaults({jar: true})

      function getAPIKeys(self){
          // Create an API request with the cookie jar turned on
          request = request.defaults({jar: true})

          var tuxApiUrl = "https://" + self.host;
          if(self.port) tuxApiUrl += ":" + self.port;
          tuxApiUrl += '/tuxedoapi.html';

          const options = {
            url: tuxApiUrl,
            headers: {
              'User-Agent': 'homebridge'
            }
          };
          request(options)
            .then(function(body){
              var root = HTMLParser.parse(body);
              var readit = root.querySelector('#readit');

              if(readit){
                self.api_key_enc = readit.getAttribute('value').toString().substr(0,64);
                self.api_iv_enc = readit.getAttribute('value').toString().substr(64, 96);

                if(self.debug) self.log("[getAPIKeys] Successfully retrieved keys");
                self.init();

              }else{
                if(root.querySelector('h1').structuredText == 'Max Number Of Connections In Use.Please Try Again.'){
                  self.log('[getAPIKeys] Max tuxedo connections exceeded. Please try again in a while.');
                }
              }
            })
            .catch(function (error) {
                self.log('[getAPIKeys] Error:', error);
            });
      }

      getAPIKeys(this);
      // create a new Security System service
      this.SecuritySystem = new Service.SecuritySystem(this.name);

      // create handlers for required characteristics
      this.SecuritySystem.getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .on('get', this.handleSecuritySystemCurrentStateGet.bind(this));

      this.SecuritySystem.getCharacteristic(Characteristic.SecuritySystemTargetState)
        .on('get', this.handleSecuritySystemTargetStateGet.bind(this))
        .on('set', this.handleSecuritySystemTargetStateSet.bind(this));

      if(this.debug) this.log('Service creation complete');
  }

HoneywellTuxedoAccessory.prototype = {
  /**
   * Init method for regular polling of device state, fired after the api keys have been retrieved
   */
  init: function() {
  	var self = this;

  	// Set up continuous polling if configured
    if(self.debug) self.log("[init] Polling is set to : " + self.polling);
  	if (self.polling) {
  		self.log("Starting polling with an interval of %s ms", self.pollInterval);

  		var emitterConfig = [
  			{
  				method: self.handleSecuritySystemCurrentStateGet.bind(this),
  				property: 'current state',
  				characteristic: Characteristic.SecuritySystemCurrentState
  			},
  			{
  				method: self.handleSecuritySystemTargetStateGet.bind(this),
  				property: 'target state',
  				characteristic: Characteristic.SecuritySystemTargetState
  			}
  		];

  		emitterConfig.forEach(config => {
  			var emitter = pollingtoevent(function(done) {
  				config.method(function (err, result) {
  					done(err, result);
  				});
  			}, { longpolling: true, interval: self.pollInterval });

  			emitter.on("longpoll", function(state) {
  				self.log('Polling noticed %s change to %s, notifying devices', config.property, state);
  				self.SecuritySystem
  						.getCharacteristic(config.characteristic)
  						.setValue(state);
  			});

  			emitter.on("error", function(err) {
  				self.log("Polling of %s failed, error was %s", config.property, err);
  			});
  		});
  	}
  },
  getServices: function(){
    if(this.debug) this.log('Get Services called');
    if(!this.SecuritySystem) return [];

    const infoService = new Service.AccessoryInformation();
    infoService.setCharacteristic(Characteristic.Manufacturer,'Honeywell-Tuxedo')

    return [infoService, this.SecuritySystem];
  },
  /**
   * Handle requests to get the current value of the "Security System Current State" characteristic
   */
  handleSecuritySystemCurrentStateGet: function(callback) {
    if(this.debug) this.log.debug('Triggered GET SecuritySystemCurrentState');

    getAlarmMode.apply(this, [returnCurrentState.bind(this)]);

    function returnCurrentState(value){
        var statusString = JSON.parse(value).Status.toString().trim();
        if(this.debug) this.log("[returnCurrentState] Retrieved status string: " + statusString + "alarmStatus[statusString] is: " + alarmStatus[statusString]);
        CurrentState  = (alarmStatus[statusString] === undefined) ? 3 : alarmStatus[statusString];

        if(value == 'Error'){
          this.SecuritySystem
  						.getCharacteristic(Characteristic.StatusFault)
  						.setValue(1); // Set Statusfault characteristic to General Fault
        }else{
          this.SecuritySystem
  						.getCharacteristic(Characteristic.StatusFault)
  						.setValue(0); // Set
        }

        if(this.debug) this.log.debug("[returnCurrentState] Received value" + value)
        if(this.debug) this.log.debug('[returnCurrentState] Found current state: ' + CurrentState);
        callback(null, CurrentState);
    }

  },

  /**
   * Handle requests to get the current value of the "Security System Target State" characteristic
   */
  handleSecuritySystemTargetStateGet: function(callback) {
    if(this.debug) this.log.debug('Triggered GET SecuritySystemTargetState');

      getAlarmMode.apply(this, [returnTargetState.bind(this)]);

      function returnTargetState(value){
          var statusString = JSON.parse(value).Status.toString().trim();
          if(this.debug) this.log.debug("[returnCurrentState] Retrieved status string: " + statusString + " alarmStatus[statusString] is: " + alarmStatus[statusString]);
          TargetState  = (alarmStatus[statusString] === undefined) ? 1 : alarmStatus[statusString];

          if(value == 'Error'){
            this.SecuritySystem
    						.getCharacteristic(Characteristic.StatusFault)
    						.setValue(1); // Set Statusfault characteristic to General Fault
          }else{
            this.SecuritySystem
    						.getCharacteristic(Characteristic.StatusFault)
    						.setValue(0); // Set
          }

          if(this.debug) this.log.debug("[returnTargetState] Received value" + value)
          if(this.debug) this.log.debug('[returnTargetState] Found target state: ' + TargetState);
          callback(null, TargetState);
      }
  },

  /**
   * Handle requests to set the "Security System Target State" characteristic
   */
  handleSecuritySystemTargetStateSet: function(value, callback) {
    if(this.debug) this.log.debug('Triggered SET SecuritySystemTargetState:' + value);

    TargetState = value;
    if(value == 0)  armAlarm.apply(this, ['STAY', callback]);
    if(value == 1)  armAlarm.apply(this, ['AWAY', callback]);
    if(value == 2)  armAlarm.apply(this, ['NIGHT', callback]);
    if(value == 3)  disarmAlarm.apply(this, [callback]);
  }
}

function callAPI_POST(url, data, paramlength, headers, callback){
  // Create an API request with the cookie jar turned on
  request = request.defaults({jar: true})
  const options = {
    method: 'POST',
    url: url,
    headers: {
      'authtoken': headers,
      'identity' : this.api_iv_enc,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: "param=" + data + "&len=" + paramlength + "&tstamp=" + Math.random(),
    json: true
  };
  if(this.debug) this.log.debug("[callAPI_POST]: Calling alarm API with url: " + options.url + " headers - authtoken: " + options.headers['authtoken'] + " headers-identity" + options.headers['identity'] + " body: " + options.body);
  request.post(options)
    .then(function(response){

      var resp;
      try {
          resp = response["Result"];
      }
      catch (e) {
          try {
              resp = response.Result;
          }
          catch (e) {
              resp = response.toString();
          }
      }

      // At this point, we have the result, so any callbacks can be executed
      if(this.debug) this.log.debug("[callAPI_POST] Response Final: " + resp);

      callback(decryptData.apply(this, [resp]));

    }.bind(this))
    .catch(function (error) {
        if(this.debug){
          this.log('[callAPI_POST] Error:', error);
        }else{
          this.log('[callAPI_POST] Error:' + error.message);
          callback('{"Status":"Error"}'); //Return an error state, this is mapped to a disarmed state in the alarmStatus dict
        }
    }.bind(this));
}

function getAlarmMode(callback){
  var url =  "https://" + this.host;
  if (this.port != "")
      url += ":" + this.port;
  url += apibasepath + "/GetSecurityStatus";
  var header = "MACID:Browser,Path:" + hPath + "/GetSecurityStatus";
  if(this.debug) this.log.debug("[getAlarmMode] About to call with, url:" + url + " header: " + header + " api_key_enc: " + this.api_key_enc);
  callAPI_POST.apply(this, [url, "", 0, CryptoJS.HmacSHA1(header, this.api_key_enc), callback]);
}

function armAlarm(mode, callback){
  var pID = 1;
  var dataCnt = encryptData.apply(this, ["arming=" + mode + "&pID=" + pID + "&ucode=" + parseInt(this.uCode) + "&operation=set"]);
  var url = protocol + "://" + this.host;
  if (this.port != "")
      url += ":" + location.port;
  url += apibasepath + "/AdvancedSecurity/ArmWithCode"; //?param=" + encryptData(dataCnt);

  var header = "MACID:Browser,Path:" + hPath + "/AdvancedSecurity/ArmWithCode";
  if(this.debug) this.log.debug("[armAlarm] About to call API with, url:" + url + " dataCnt: " + dataCnt + " header: " + header + " api_key_enc: " + this.api_key_enc);
  callAPI_POST.apply(this, [url, dataCnt, dataCnt.length, CryptoJS.HmacSHA1(header, this.api_key_enc), finishArming]);

  function finishArming(){
    callback(null);
  }

}

function disarmAlarm(callback){
  var pID = 1;
  var dataCnt = encryptData.apply(this, ["pID=" + pID + "&ucode=" + parseInt(this.uCode) + "&operation=set"]);
  var url = protocol + "://" + this.host;
  if (this.port != "")
       url += ":" + location.port;
  url += apibasepath + "/AdvancedSecurity/DisarmWithCode"; //?param=" + encryptData(dataCnt);

  var header = "MACID:Browser,Path:" + hPath + "/AdvancedSecurity/DisarmWithCode";
  if(this.debug) this.log.debug("[disarmAlarm] About to call API with, url:" + url + " dataCnt: " + dataCnt + " header: " + header + " api_key_enc: " + this.api_key_enc);
  callAPI_POST.apply(this, [url, dataCnt, dataCnt.length, CryptoJS.HmacSHA1(header, this.api_key_enc), finishDisarming]);

  function finishDisarming(value){
    callback(null);
  }

}

function decryptData(data) {
    var encrypted = {};
    encrypted.ciphertext = CryptoJS.enc.Base64.parse(data);
    var decrypted = CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Hex.parse(this.api_key_enc),
    {
        iv: CryptoJS.enc.Hex.parse(this.api_iv_enc),
        salt: "",
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    if(this.debug) this.log.debug("[decryptData] Returning: " +  decrypted.toString(CryptoJS.enc.Latin1));
    return decrypted.toString(CryptoJS.enc.Latin1);
}

function encryptData(data) {
    var encString = CryptoJS.AES.encrypt(data, CryptoJS.enc.Hex.parse(this.api_key_enc),
    {
        iv: CryptoJS.enc.Hex.parse(this.api_iv_enc),
        salt: "",
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return encodeURIComponent(encString);
}
