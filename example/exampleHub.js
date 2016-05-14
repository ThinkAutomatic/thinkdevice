'use strict';

var td = require('thinkdevice');

// Connect to Think Automatic platform as hub whose interface is specified
// by the given deviceTypeUuid. Device types can be designed and browsed by
// going to https://app.thinkautomatic.io/deviceTypes.
td.connect({ name: 'Example Hub',  deviceTypeUuid: '636a0568-5dd1-414f-9328-a092164e5374' }, function () { 
  console.log('Started')
});

td.on('open', function() {
  console.log('Connection to platform is opened');  
});

// This is the main message handler
td.on('message', function (data) {
  console.log('Received:');
  console.log(data);
});

td.on('error', function () {
  console.log('Error receiving data from platform');
});

