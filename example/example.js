'use strict';

var td = require('thinkdevice');

td.connect({ name: 'Think Hub',  deviceTypeUuid: 'ada8ffe3-0cfb-4506-9371-0f9d0e1403ca' }, function () { 
  console.log('Started')
});

td.on('open', function() {
  console.log('Connection to platform is opened');  
});

td.on('message', function (data) {
  console.log('Received:');
  console.log(JSON.stringify(data));
});

td.on('error', function () {
  console.log('Error receiving data from platform');
});

