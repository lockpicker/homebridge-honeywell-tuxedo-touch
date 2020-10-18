# homebridge-honeywell-tuxedo-touch
Homebridge plugin for the [Honeywell Tuxedo Touch Wifi security system](https://www.honeywellhome.com/us/en/products/security/security-systems/tuxwifiw-white-tuxedo-touch-7-in-graphic-touchscreen-tuxwifiw/).

This plugin exposes the Honeywell Tuxedo Touch Wifi unit as a security system accessory in Homekit through [Homebridge](http://homebridge.io)

## Installation

1. Install homebridge using: npm install -g homebridge
2. Install homebridge-honeywell-tuxedo-touch using: npm install -g homebridge-honeywell-tuxedo-touch
3. Update your configuration file. See sample-config.json in this repository for a sample.

## Features
This plugin currently only supports the security system feature of the Honeywell Tuxedo Touch unit. It maps the following modes:
<table style='align:center'>
  <tr><td><b>Homekit Mode</b></td><td><b>Tuxedo Mode</b></td></tr>
  <tr><td>Home </td><td>Stay</td></tr>
  <tr><td>Night </td><td>Night</td></tr>
  <tr><td>Away </td><td>Away</td></tr>
</table>

Given enough time and motivation, this can be converted to a platform accessory and expanded to fetch other devices controlled by the Tuxedo unit.

## Configuration
The configuration options are the following:

Minimum options:
```
"accessories": [
  {
    "accessory": "Honeywell Tuxedo Touch",
    "host": "myalarm.ddns.net",
    "alarmCode": "1234"
  }
]

```

All options:
```
"accessories": [
  {
    "name": "Home Security",
    "accessory": "Honeywell Tuxedo Touch",
    "host": "myalarm.ddns.net",
    "port": "8000",
    "alarmCode": "1234",
    "polling": true,
    "pollInterval": 10000,
    "fetchKeysBeforeEverySetCall" : false,
    "debug": false
  }
]

```

- The **name** parameter is optional and determines the name of the security system you will see in HomeKit.
- The **accessory** parameter tells Homebridge which plugin to load for this accessory. Leave this exactly as described in the example config.
- The **host** parameter accepts the ip address or the hostname of the Tuxedo touch unit.
  Whilst the IP address can be the local LAN ip of the unit, the tuxedo touch unit is sometimes unresponsive when accessed through the lan ip, it seems a lot more reliable when accessed through the WAN interface.
  If you have a static ip which exposes the unit, you can use that, if not, setup a dynamic dns, expose your tuxedo unit through that and use it with this plugin.
  Though note that **if your local LAN IP works reliably, that should be your first preference**.
- The **port** parameter is optional and accepts the port number of the host on which the Tuxedo touch unit is available. The tuxedo API only responds over the https port(443), so if you're using port forwarding, remember to use the port that forwards to 443 on the tuxedo unit.
- The **alarmCode** parameter accepts your security alarm code for arming and disarming the security system.
- The **polling** is a boolean that specifies if the current state should be pulled on regular intervals or not.
  This is optional and defaults to false however using this is recommended as it will keep your Homekit status synced with the unit if the state changes outside of a Homekit operation.
- **pollInterval** is a number which defines the poll interval in milliseconds. Defaults to 30000.
- **fetchKeysBeforeEverySetCall** is currently an experimental optional parameter for units that potentially have a bug due to which the get api may return incorrect state. This may be corrected by re-fetching the API keys at the time the SET calls are being made. This should only be used if you're getting a state issue e.g. Alarm is armed in night mode but homekit is displaying off etc.
- The **debug** parameter is boolean and turns on debug messages.

## Troubleshooting tips
- Make sure to disable "Authentication for web server local access" from the accounts screen under settings on the tuxedo unit.

## FAQ
- Node may throw the following warning
  ```
  Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification.
  ```
  This is because the Tuxedo units come with really old certs which aren't trusted anymore, without any way to upgrade these certs, the workaround is to not check the cert.

## Dev fuel

<a href="https://www.buymeacoffee.com/lockpicker" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

## Credits
I used the [homebridge-http-securitysystem](https://www.npmjs.com/package/homebridge-http-securitysystem) for a while, hacked together for my personal use which inspired me to create a specific plugin for the Tuxedo touch for the benefit of all.
