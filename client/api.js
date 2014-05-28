window.zerver = function (window, zerver) {
	var TIMEOUT = 30 * 1000;

	if ( !zerver ) {
		zerver = {
			prefix    : '/zerver/',
			get       : getRequest,
			post      : postRequest,
			put       : putRequest,
			patch     : patchRequest,
			del       : deleteRequest,
			request   : makeAPICall
		};
	}

	return zerver;

	function getRequest(resource, data, callback) {
		return makeAPICall('GET', resource, data, callback);
	}
	function postRequest(resource, data, callback) {
		return makeAPICall('POST', resource, data, callback);
	}
	function putRequest(resource, data, callback) {
		return makeAPICall('PUT', resource, data, callback);
	}
	function patchRequest(resource, data, callback) {
		return makeAPICall('PATCH', resource, data, callback);
	}
	function deleteRequest(resource, data, callback) {
		return makeAPICall('DELETE', resource, data, callback);
	}

	function makeAPICall (method, resource, data, callback) {
		if (typeof data === 'function') {
			callback = data;
			data     = null;
		}

		var done = false,
			xhr  = new XMLHttpRequest(),
			url  = resource,
			contentType;

		if ((url[0] !== '/') && (url.substr(0,7) !== 'http://') && (url.substr(0,8) !== 'https://')) {
			url = zerver.prefix+url;
		}

		method = method.toUpperCase();
		switch (method) {
			case 'POST':
			case 'PUT':
			case 'PATCH':
				if (data && (typeof data === 'object')) {
					contentType = 'application/json';
					data = JSON.stringify(data);
				} else {
					contentType = 'text/plain';
				}
				break;
			default:
				if (data && (typeof data === 'object')) {
					data = Object.keys(data).map(function (key) {
						return encodeURIComponent(key)+'='+encodeURIComponent(data[key]);
					}).join('&');
				}
				if (data) {
					var index = url.indexOf('?'),
						last  = url[url.length-1];
					if (index === -1) {
						url += '?';
					} else if (last !== '?' && last !== '&') {
						url += '&';
					}
					url += data;
					data = null;
				}
				break;
		}

		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4) {
				xhrComplete(xhr.status);
			}
		};
		xhr.onload = function () {
			xhrComplete(xhr.status);
		};
		xhr.onerror = function () {
			xhrComplete(xhr.status);
		};

		xhr.timeout = parseInt(window['ZERVER_TIMEOUT']) || TIMEOUT;
		xhr.ontimeout = function () {
			xhrComplete(0);
		};

		setTimeout(function () {
			if ( !done ) {
				xhr.abort();
				xhrComplete(0);
			}
		}, TIMEOUT);

		xhr.open(method, url, true);
		if (contentType) {
			xhr.setRequestHeader('Content-Type', contentType);
		}
		xhr.send(data);

		function xhrComplete (status) {
			if (done) {
				return;
			}
			done = true;

			var response;
			try {
				response = JSON.parse(xhr.responseText);
			} catch (err) {}

			if (callback) {
				callback(response, xhr.responseText, status);
			}
		}
	}
}(window, window.zerver);
