module.exports = {
	join     : asyncJoin,
	sequence : asyncSequence,
	forEach  : asyncForEach,
	replace  : asyncReplace,
};

function asyncJoin(funcs, callback, self) {
	if ( !self ) {
		self = this;
	}

	var num = funcs.length;
	if ( !num ) {
		callback();
		return;
	}

	var responses = new Array(num);
	funcs.forEach(function (func, index) {
		var lock = false;

		func.call(self, function (data) {
			if (lock) {
				return;
			}
			lock = true;

			responses[index] = data;
			if ( !--num ) {
				callback.call(this, responses);
			}
		});
	});
}

function asyncSequence() {
	var funcs = Array.prototype.slice.call(arguments);
	next();
	function next() {
		var func = funcs.shift();
		if (func) {
			func(next);
		}
	}
}

function asyncForEach(arr, handler, callback) {
	arr = arr.slice();
	next();
	function next() {
		var elem = arr.shift();
		if (elem) {
			handler(elem, next);
		} else {
			callback();
		}
	}
}

function asyncReplace(str, matcher, handler, callback) {
	var self    = this,
		matches = {};
	str = str.replace(matcher, function (original, data) {
		var matchID = '__ZERVER_INLINE__'+Math.random();
		matches[matchID] = [original, data];
		return matchID;
	});

	var matchIDs = Object.keys(matches);
	if ( !matchIDs.length ) {
		callback(str);
		return;
	}

	asyncForEach(
		matchIDs,
		function (matchID, respond) {
			handler(matches[matchID][1], function (newData) {
				if (newData) {
					matches[matchID] = newData;
				} else {
					matches[matchID] = matches[matchID][0];
				}
				respond();
			});
		},
		function () {
			for (var matchID in matches) {
				str = str.replace(matchID, matches[matchID]);
			}
			callback(str);
		}
	);
}
