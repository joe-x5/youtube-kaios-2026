/**
 @license

 innopia_rcu_src.js
 @author kayoung124@innopiatech.com

 Copyright 2018 Innopia Technologies, Inc.

 Licensed under the Apache License, Version 2.0 (the "License");

 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

var innopia = innopia || {};
innopia.dial = innopia.dial || {};

innopia.dial.search = function(searchObj) {
  const SSDP_PORT = 1900;
  const SSDP_ADDRESS = '239.255.255.250';
  const SSDP_DISCOVER_MX = 10;
  const SEARCH_TARGET = 'urn:dial-multiscreen-org:service:dial:1';
  const SSDP_RESPONSE_HEADER = /HTTP\/\d{1}\.\d{1} \d+ .*/;
  const REMOTE_DIAL_PLAYER_NAME = 'kplayer';
  const SSDP_DISCOVER_PACKET = 'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: ' + SSDP_ADDRESS + ':' + SSDP_PORT + '\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: ' + SSDP_DISCOVER_MX + '\r\n' +
      'ST: ' + SEARCH_TARGET + '\r\n' +
      '\r\n';
  const SEARCH_TYPE = ['wlan', 'rndis'];

  var check_type = false;
  for (var i = 0; SEARCH_TYPE.length > i; i++) {
    if (SEARCH_TYPE[i] == searchObj.type) {
      check_type = true;
    }
  }
  if (check_type == false) {
    searchObj.fail({
      error: 'invalid_parameter',
      error_description: 'type:' + searchObj.type + ' [\'wlan\'|\'rndis\']'
    });
    return;
  }

  if (!(typeof searchObj.timeout === 'number') || searchObj.timeout <= 0) {
    searchObj.fail({
      error: 'invalid_parameter',
      error_description: 'timeout:' + searchObj.timeout
    });
    return;
  }

  function DialServerSearch(obj) {
    this.socket = null;
    this.response = false;
    this.search = obj;
    this.getIp = false;
  }

  var tmp = null;
  DialServerSearch.prototype = {
    rndis_check: function() {
      tmp = this;
      var dongleManager = window.navigator.dongleManager;
      dongleManager.ondonglestatuschange = function(event) {
        // console.log('ondonglestatuschange'+tmp.response+' isConnected =
        // '+event.isConnected);
        if (event.isConnected) {
          // console.log('ondonglestatuschange ===='+event.usbIpAddress);
          if (tmp.getIp == false) {
            new DialServerSearch(tmp.search)
                .start(
                    SSDP_DISCOVER_PACKET, SSDP_ADDRESS, SSDP_PORT,
                    event.usbIpAddress);
          }
        }
      };
      if (typeof this.search.timeout === 'number') {
        timeout(close_event, this.search.timeout, this);
      }

      function close_event(context) {
        if (tmp.getIp == false && context.response == false) {
          context.response = true;
          searchObj.fail({
            error: 'no_getip',
            error_description: 'type:' + context.search.type
          });
        }
      }

      function timeout() {
        var func = arguments[0];
        var delay = arguments[1];

        if (arguments.length > 2) {
          var arg = Array.prototype.slice.call(arguments, 2);
          return timeout(function() {
            func.apply(null, arg);
          }, delay);
        } else {
          return window.setTimeout(func, delay);
        }
      }
    },
    start: function(packet, ip, port, local) {
      this.getIp = true;
      if (local != null) {
        this.socket = new UDPSocket({localAddress: local, loopback: true});
      } else {
        this.socket = new UDPSocket({loopback: true});
      }
      this.socket.joinMulticastGroup(SSDP_ADDRESS);
      this.socket.onmessage = receive.bind(this);
      this.socket.opened.then((function() {
                                var ok = this.socket.send(packet, ip, port);
                              }).bind(this));

      if (typeof this.search.timeout === 'number') {
        timeout(close, this.search.timeout, this);
      }

      function receive(e) {
        var msg = String.fromCharCode.apply(null, new Uint8Array(e.data));
        console.log('[rcu]' + msg);
        var lines = msg.toString().split('\r\n');
        var firstLine = lines.shift();
        var method = SSDP_RESPONSE_HEADER.test(firstLine) ?
            'RESPONSE' :
            firstLine.split('')[0].toUpperCase();
        var headers = {};

        lines.forEach(function(line) {
          if (line.length) {
            var pairs = line.match(/^([^:]+):\s*(.*)$/);
            if (pairs) {
              headers[pairs[1].toLowerCase()] = pairs[2];
            }
          }
        });

        if (headers.location) {
          this.response = true;
          getDeviceInfo(this.search.success, headers.location, e.remoteAddress);
        }
      }

      function getDeviceInfo(func, url, ip) {
        var xhr = new XMLHttpRequest({mozSystem: true});
        xhr.open('GET', url, true);
        xhr.overrideMimeType('text/xml');
        xhr.addEventListener(
            'load',
            (function() {
              if (xhr.status == 200) {
                var devices = xhr.responseXML.querySelectorAll('device');
                var DialServerSearchlname =
                    devices[0].querySelector('modelName').textContent;
                var friendlyName =
                    devices[0].querySelector('friendlyName').textContent;
                var uuid = devices[0].querySelector('UDN').textContent;

                var JioDongle = false;
                if (uuid == 'uuid:C5D432D9-6036-4C0D-ABEF-E1B8ED4FE057') {
                  JioDongle = true;
                }

                var outputType = 'HDMI';
                if (DialServerSearchlname == 'IMT-M532') {
                  outputType = 'CVBS';
                }
                console.log(DialServerSearchlname);
                func({
                  name: friendlyName,
                  output: outputType,
                  isJioDongle: JioDongle,
                  ip: ip,
                  url: xhr.getResponseHeader('Application-URL') + 'YouTube'
                });
              }
            }).bind(this),
            false);
        xhr.send(null);
      }

      function close(context) {
        if (context.socket != null) {
          if (context.socket.readyState != 'close') {
            context.socket.close;
          }
        }
        if (context.response == false) {
          searchObj.fail({
            error: 'no_response',
            error_description: 'type:' + context.search.type
          });
        }
      }

      function timeout() {
        var func = arguments[0];
        var delay = arguments[1];

        if (arguments.length > 2) {
          var arg = Array.prototype.slice.call(arguments, 2);
          return timeout(function() {
            func.apply(null, arg);
          }, delay);
        } else {
          return window.setTimeout(func, delay);
        }
      }
    }
  };
  if (searchObj.type == 'wlan') {
    new DialServerSearch(searchObj).start(
        SSDP_DISCOVER_PACKET, SSDP_ADDRESS, SSDP_PORT, null);
  } else if (searchObj.type == 'rndis') {
    var dongleManager = window.navigator.dongleManager;
    if (typeof dongleManager === 'undefined') {
      new DialServerSearch(searchObj).start(
          SSDP_DISCOVER_PACKET, SSDP_ADDRESS, SSDP_PORT, '192.168.0.1');

    } else {
      var dongleEnabled = dongleManager.dongleStatus;
      if (dongleEnabled) {
        var usbIpAddress = dongleManager.usbIpAddress;
        if (usbIpAddress != null) {
          new DialServerSearch(searchObj).start(
              SSDP_DISCOVER_PACKET, SSDP_ADDRESS, SSDP_PORT, usbIpAddress);
        } else {
          new DialServerSearch(searchObj).rndis_check();
        }
      } else {
        new DialServerSearch(searchObj).rndis_check();
      }
    }
  }
};
innopia.rcu = innopia.rcu || {};
innopia.rcu.currentinnorcu = null;
innopia.rcu.isrunning_connect = false;
innopia.rcu.connect = function(playerObj) {
  function innorcu(rcuConnectObj) {
    this.innorcu = rcuConnectObj;
    this.socket = null;
    this.status = 'stopped';
    this.launchstatus = 'stopped';
    this.connectresult = false;
    this.remoteip = null;
    this.currentinnorcu = null;
    this.cmd = null;
  }

  innorcu.prototype = {
    connectRCU: function() {
      if (innopia.rcu.isrunning_connect == true) {
        console.log('[rcu] connect API running !!!  ');
        return;
      } else {
        console.log('[rcu] connect API call !!!  ');
      }
      innopia.rcu.isrunning_connect = true;
      requestApplicationStatus(this);

      function requestApplicationStatus(context) {
        var xhr_get = new XMLHttpRequest({mozSystem: true});
        xhr_get.open('GET', context.innorcu.server.url, true);
        xhr_get.overrideMimeType('text/xml');
        xhr_get.addEventListener(
            'load',
            (function() {
              if (xhr_get.status == 200) {
                var state = xhr_get.responseXML.getElementsByTagName('state')[0]
                                .childNodes[0]
                                .nodeValue;

                context.launchstatus = state;
                console.log(
                    '[rcu] context.launchstatus' + context.launchstatus);
                if (state == null || state.match('stopped')) {
                  requestApplicationLaunch(context); /*Player launch*/
                } else if (state.match('running')) {
                  if (context.socket == null) {
                    makeTcpSocket(context);
                  }
                  /*

                  if ( context.connectresult == false ) {
                          context.innorcu.success(context.innorcu.server,
                  innopia.rcu.currentinnorcu); context.connectresult = true;
                  }
                  */
                } else if (state.match('Created')) {
                  timeout(_requestApplicationStatus, 2000, context);
                }
              } else if (xhr_get.status == 404) {
                innopia.rcu.isrunning_connect = false;
                if (context.connectresult == false) {
                  context.innorcu.fail(
                      context.innorcu.server,
                      {error: 'not_supported', error_description: 'youtube'});
                  context.connectresult = true;
                }
              } else {
                innopia.rcu.isrunning_connect = false;
                if (context.connectresult == false) {
                  context.innorcu.fail(context.innorcu.server, {
                    error: 'application_failed',
                    error_description: 'status_failed'
                  });
                  context.connectresult = true;
                }
              }
            }).bind(this),
            false);
        xhr_get.send(null);
      }

      function requestApplicationLaunch(context) {
        var xhr = new XMLHttpRequest({mozSystem: true});
        xhr.open('POST', context.innorcu.server.url, true);
        xhr.setRequestHeader('Content-Type', 'text/plain; charset=UTF-8');
        xhr.addEventListener(
            'load', (function() {
                      if (xhr.status == 200 || xhr.status == 201) {
                        timeout(requestApplicationStatus, 1000, context);
                      } else {
                        innopia.rcu.isrunning_connect = false;
                        if (context.connectresult == false) {
                          context.innorcu.fail(context.innorcu.server, {
                            error: 'application_launch_failed',
                            error_description: 'launch_failed'
                          });
                          context.connectresult = true;
                        }
                      }
                    }).bind(Context),
            false);
        xhr.send(null);
      }

      function makeTcpSocket(context) {
        if (context.socket != null && context.socket.readyState != 'closed') {
          context.socket.close();
        }
        context.socket =
            navigator.mozTCPSocket.open(context.innorcu.server.ip, 2018);
        context.socket.onopen = function(event) {
          console.log('[rcu] socket open response= ' + context.connectresult);
          innopia.rcu.isrunning_connect = false;
          if (context.connectresult == false) {
            context.innorcu.success(
                context.innorcu.server, innopia.rcu.currentinnorcu);
            context.connectresult = true;
            if (context.status != 'CONNECTED') {
              context.status = 'CONNECTED';
              context.innorcu.changestatus(context.status);
            }
          }
        };
        context.socket.ondata = context._responseData.bind(context);

        context.socket.onerror = function(event) {
          console.log('[rcu] socket.onerror ');
          innopia.rcu.isrunning_connect = false;
          if (context.connectresult == false) {
            context.innorcu.fail(
                context.innorcu.server,
                {error: 'connection_error', error_description: 'socket_error'});
            context.connectresult = true;
          } else {
            if (context.status != 'DISCONNECTED') {
              context.status = 'DISCONNECTED';
              context.innorcu.changestatus(context.status);
              // innopia.rcu.currentinnorcu =  null;
              context.connectresult = false;
              context.socket.close();
            }
          }
        };

        context.socket.onclose = function() {
          console.log('[rcu] socket close ');
          innopia.rcu.isrunning_connect = false;
          if (context.connectresult == false) {
            context.innorcu.fail(
                context.innorcu.server,
                {error: 'connection_error', error_description: 'socket_close'});
            context.connectresult = true;
          } else {
            if (context.status != 'DISCONNECTED') {
              context.status = 'DISCONNECTED';
              context.innorcu.changestatus(context.status);
              // innopia.rcu.currentinnorcu =  null;
              context.connectresult = false;
            }
          }
        };
      }

      function timeout() {
        var func = arguments[0];
        var delay = arguments[1];

        if (arguments.length > 2) {
          var arg = Array.prototype.slice.call(arguments, 2);
          return timeout(function() {
            func.apply(null, arg);
          }, delay);
        } else {
          return window.setTimeout(func, delay);
        }
      }
    },

    _responseData: function(event) {
      var buf = null;
      if (typeof event.data === 'string') {
        var msg = event.data;
        if (typeof msg === 'string') {
          var buf = new ArrayBuffer(msg.length);
          var dv = new Uint8Array(buf);
          for (var i = 0, strLen = msg.length; i < strLen; i++) {
            dv[i] = msg.charCodeAt(i);
          }
        } else {
          buf = msg;
        }
        var dv = new DataView(buf);
        var sof = dv.getUint8(0);
        var type = dv.getUint8(1);
        var cmd = dv.getUint8(2);
        if (type == 2 && cmd == 1) {
          console.log('[rcu] ####### NOTIFY::Cobalt:YouTube Finish');
          if (innopia.rcu.currentinnorcu != null) {
            innopia.rcu.currentinnorcu.status = 'FINISH_YOUTUBE';
            innopia.rcu.currentinnorcu.innorcu.changestatus(
                innopia.rcu.currentinnorcu.status);
          }
        }
      }
    },

    _sendData: function(func_name, cmd) {
      if (innopia.rcu.currentinnorcu != null &&
          innopia.rcu.currentinnorcu.status == 'CONNECTED') {
        /* TODO ...*/
        console.log('[rcu] _sendData : ' + cmd);
        context = this;
        this.cmd = cmd;

        context.socket.send(context.cmd);
        /*
        this.socket = navigator.mozTCPSocket.open(this.innorcu.server.ip, 1818);
        this.socket.onopen = function(event){
                context.socket.send(context.cmd);
                context.socket.close();

        };
        */
      } /*else {
              if ( this.connectresult = false || (innopia.rcu.currentinnorcu!=
      null &&  innopia.rcu.currentinnorcu.status == 'DISCONNECTED') ) {
                      this.innorcu.response({type:'CMD_ERROR',data:{error:'connection_request',
      error_description:func_name}}); } else {
                      this.innorcu.response({type:'CMD_ERROR',data:{error:'network_unreachable',
      error_description:func_name}});
              }
      }*/
    },

    disconnect: function() {
      if (this.socket != null && this.socket.readyState != 'closed') {
        this.socket.close();
        // this.innorcu.changestatus(this.playerstatus);
      }
      innopia.rcu.currentinnorcu = null;
    },

    key_Enter: function() {
      var cmd = new ArrayBuffer(6);
      var dv = new DataView(cmd);
      dv.setUint8(0, 119);
      dv.setUint8(1, 0);
      dv.setUint8(2, 16);
      dv.setUint16(3, 1, true);
      dv.setUint8(5, 95);
      this._sendData('key_Enter', cmd);
    },

    key_Up: function() {
      var cmd = new ArrayBuffer(6);
      var dv = new DataView(cmd);
      dv.setUint8(0, 119);
      dv.setUint8(1, 0);
      dv.setUint8(2, 16);
      dv.setUint16(3, 1, true);
      dv.setUint8(5, 91);
      this._sendData('key_Up', cmd);
    },

    key_Down: function() {
      var cmd = new ArrayBuffer(6);
      var dv = new DataView(cmd);
      dv.setUint8(0, 119);
      dv.setUint8(1, 0);
      dv.setUint8(2, 16);
      dv.setUint16(3, 1, true);
      dv.setUint8(5, 92);
      this._sendData('key_Down', cmd);
    },

    key_Left: function() {
      var cmd = new ArrayBuffer(6);
      var dv = new DataView(cmd);
      dv.setUint8(0, 119);
      dv.setUint8(1, 0);
      dv.setUint8(2, 16);
      dv.setUint16(3, 1, true);
      dv.setUint8(5, 93);
      this._sendData('key_Left', cmd);
    },

    key_Right: function() {
      var cmd = new ArrayBuffer(6);
      var dv = new DataView(cmd);
      dv.setUint8(0, 119);
      dv.setUint8(1, 0);
      dv.setUint8(2, 16);
      dv.setUint16(3, 1, true);
      dv.setUint8(5, 94);
      this._sendData('key_Right', cmd);
    },

    key_Back: function() {
      var cmd = new ArrayBuffer(6);
      var dv = new DataView(cmd);
      dv.setUint8(0, 119);
      dv.setUint8(1, 0);
      dv.setUint8(2, 16);
      dv.setUint16(3, 1, true);
      dv.setUint8(5, 96);
      this._sendData('key_Back', cmd);
    },

    key_Exit: function() {
      var cmd = new ArrayBuffer(5);
      var dv = new DataView(cmd);
      dv.setUint8(0, 119);
      dv.setUint8(1, 0);
      dv.setUint8(2, 17);
      dv.setUint16(3, 0, true);
      this._sendData('key_Exit', cmd);
    }

  }

  if (innopia.rcu.currentinnorcu != null) {
    innopia.rcu.currentinnorcu.disconnect();
    innopia.rcu.currentinnorcu = null;
  }
  innopia.rcu.currentinnorcu = new innorcu(playerObj);
  innopia.rcu.currentinnorcu.connectRCU();
}
