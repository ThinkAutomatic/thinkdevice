'use strict';

var td = require('thinkdevice');

// Connect to Think Automatic platform as a Widget whose interface is specified
// by the given deviceTypeUuid. Device types can be designed and browsed by
// going to https://app.thinkautomatic.io/deviceTypes.
td.connect({ name: 'Example Widget',  deviceTypeUuid: 'fa3aff64-f259-4212-9adf-ab53ac9106fe' }, function () { 
  console.log('Started')
});

td.on('open', function() {
  console.log('Connection to platform is opened');  
});

// This is the main message handler
td.on('message', function (data) {
  console.log('Received:');
  console.log(data);
  if (data.action && data.action.rangeAttr) {
    // This is where commands for the widget would be processed.
    console.log('** Do something with rangeAttr value "' + data.action.rangeAttr.toString() + '" here');
  }
  else if (data.link) {
    // The Widget can act as a hub device meaning that it can relay messages for 
    // other devices. This section would be where a link request from the 
    // platform would be handled.
    console.log('** Link request received ' + JSON.stringify(data.link));
  }
});

td.on('error', function () {
  console.log('Error receiving data from platform');
});

// The code below is to send device events to the platform based on key presses. 
var stdin = process.stdin;

stdin.setRawMode( true );
stdin.resume();
stdin.setEncoding( 'utf8' );

stdin.on( 'data', function( key ) {
  switch (key.charCodeAt(0)) {
    case 3:         process.exit(1);                    break;  // Ctrl - C
    case 27:
      switch (key.charCodeAt(2)) {
        case 65:    td.patch({ discreteAttr: 'up' });   break;  // up arrow key
        case 66:    td.patch({ discreteAttr: 'down' }); break;  // down arrow key
      }
      break;
  }
});
