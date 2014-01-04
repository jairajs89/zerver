module.exports = CookieJar;



function CookieJar(req) {
	this._oldCookies = parseCookies(req.headers.cookie);
	this._newCookies = {};
}

CookieJar.prototype.get = function (name) {
	return this._oldCookies[name];
};

CookieJar.prototype.set = function (name, value, options) {
	this._newCookies[name] = serialiseCookie(name, value, options);
};

CookieJar.prototype.setHeaders = function (headers) {
	var setCookies = [];
	if (typeof headers['Set-Cookie'] === 'string') {
		setCookies.push( headers['Set-Cookie'] );
	} else if ( Array.isArray(headers['Set-Cookie']) ) {
		setCookies = headers['Set-Cookie'].slice();
	}

	for (var name in this._newCookies) {
		setCookies.push( this._newCookies[name] );
	}

	if (setCookies.length) {
		headers['Set-Cookie'] = setCookies;
	} else {
		delete headers['Set-Cookie'];
	}
};



function serialiseCookie (name, value, options) {
	var pairs = [];

	if (typeof name !== 'string') {
		throw TypeError('cookie name must be a string, got ' + name);
	}
	value = value || '';
	if (typeof value !== 'string') {
		throw TypeError('cookie value must be a string, got ' + value);
	}
	pairs.push(name + '=' + encodeURIComponent(value));

	options = options || {};
	if (typeof options !== 'object') {
		throw TypeError('cookie options must be an object, got ' + options);
	}
	if (options.maxAge) {
		switch (typeof options.maxAge) {
			case 'number':
			case 'string':
				break;
			default:
				throw TypeError('cookie max age must be a number or string, got ' + options.maxAge);
		}
		pairs.push('Max-Age=' + options.maxAge);
	}
	if (options.domain) {
		if (typeof options.domain !== 'string') {
			throw TypeError('cookie domain must be a string, got ' + options.domain);
		}
		pairs.push('Domain=' + options.domain);
	}
	if (options.path) {
		if (typeof options.path !== 'string') {
			throw TypeError('cookie path must be a string, got ' + options.path);
		}
		pairs.push('Path=' + options.path);
	}
	if (options.expires) {
		if ( !(options.expires instanceof Date) ) {
			throw TypeError('cookie expiry must be a date, got ' + options.date);
		}
		pairs.push('Expires=' + options.expires.toUTCString());
	}
	if (options.httpOnly) {
		pairs.push('HttpOnly');
	}
	if (options.secure) {
		pairs.push('Secure');
	}
	return pairs.join('; ');
}

function parseCookies (rawCookies) {
	var cookies = {};

	(rawCookies || '').split(/[;,] */).forEach(function(pair) {
		var index = pair.indexOf('=');
		if (index === -1) {
			return;
		}

		var key = pair.substr(0, index).trim(),
			val = pair.substr(index+1).trim();

		if ((val[0] === '"') && (val[val.length-1] === '"')) {
			val = val.slice(1, -1);
		}

		if ( !(key in cookies) ) {
			try {
				cookies[key] = decodeURIComponent(val);
			} catch (e) {
				cookies[key] = val;
			}
		}
	});

	return cookies;
}
