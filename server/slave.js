var extend = require('util')._extend,
	path   = require('path'),
	Zerver = require(__dirname+path.sep+'zerver');

module.exports = Slave;



function Slave(options) {
	this.options = extend({}, options || {});
	new Zerver(this.options, function () {
		process.send({ started: true });
	});
	process.on('message', function (data) {
		console.log('---');
		console.log(data);
		console.log('---');
	});
}
