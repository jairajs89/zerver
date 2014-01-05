var express = require('express'),
	zerver  = require('zerver');

var app = express();

app.use( zerver.middleware(__dirname) );
app.use( express.static(__dirname + '/src') );

app.get('/', function (req, res) {
	res.send('Hello World');
});

app.listen(3000);
console.log('Listening on port 3000');
