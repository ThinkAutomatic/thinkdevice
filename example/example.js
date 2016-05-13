'use strict';

var td = require('thinkdevice');

td.connect({ name: 'Example Widget',  deviceTypeUuid: 'fa3aff64-f259-4212-9adf-ab53ac9106fe' }, function () { 
  console.log('Started')
});

td.on('open', function() {
  console.log('Connection to platform is opened');  
});

td.on('message', function (data) {
  console.log('Received:');
  console.log(data);
});

td.on('error', function () {
  console.log('Error receiving data from platform');
});

