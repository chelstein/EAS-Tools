
function parseWav(wav) {
  function readInt(i, bytes) {
    var ret = 0,
        shft = 0;

    while (bytes) {
      ret += wav[i] << shft;
      shft += 8;
      i++;
      bytes--;
    }
    return ret;
  }
  if (readInt(20, 2) != 1) throw 'Invalid compression code, not PCM';
  //if (readInt(22, 2) != 1) throw 'Invalid number of channels, not 1';
  return {
    sampleRate: readInt(24, 4),
    bitsPerSample: readInt(34, 2),
    samples: wav.subarray(44)
  };
}

function Uint8ArrayToFloat32Array(u8a){
  var f32Buffer = new Float32Array(u8a.length);
  for (var i = 0; i < u8a.length; i++) {
    var value = u8a[i<<1] + (u8a[(i<<1)+1]<<8);
    if (value >= 0x8000) value |= ~0x7FFF;
    f32Buffer[i] = value / 0x8000;
  }
  return f32Buffer;
}

var self2=self;

self.Mp3LameEncoderConfig = {
	'TOTAL_MEMORY': 16777216*10
};

function go(){
//postMessage({'type' : 'progress', 'data': '(Loading...)'});
importScripts('./Mp3LameEncoder.js');

self2.onmessage = function(event) {
	try{
		var message = event.data;

		var buffer = message.data;
		data = parseWav(buffer);
		//console.log(data);

		var array = Uint8ArrayToFloat32Array(data.samples);
		//console.log(array);

		/*var mp3codec = Lame.init();
		Lame.set_mode(mp3codec, 3 || Lame.JOINT_STEREO);
		Lame.set_num_channels(mp3codec, 1 || 2);
		//Lame.set_num_samples(mp3codec, -1);
		Lame.set_in_samplerate(mp3codec, data.sampleRate || 44100);
		//Lame.set_out_samplerate(mp3codec, data.sampleRate || 44100);
		Lame.set_bitrate(mp3codec, data.bitsPerSample || 128);
		Lame.init_params(mp3codec);
		var mp3data = Lame.encode_buffer_ieee_float(mp3codec, array, array);
		Lame.encode_flush(mp3codec);
		Lame.close(mp3codec);
		var blob=new Blob([new Uint8Array(mp3data.data)], {type: 'audio/mp3'});		*/

		//function(sampleRate, bitRate, channels, mode)
		encoder = new Mp3LameEncoder(data.sampleRate, data.bitsPerSample, 1, 3); //3: mono
		//blob = encoder.encode2(data.sampleRate, data.bitsPerSample, array);
		encoder.encode([array]);
		blob = encoder.finish();

		postMessage({'blob':blob});
	}catch(err){
		postMessage({'error':err+''});
	}
}
postMessage({'type' : 'ready'});
}

function number_format(number, decimals, dec_point, thousands_sep) {
  number = (number + '').replace(/[^0-9+\-Ee.]/g, '');
  var n = !isFinite(+number) ? 0 : +number,
    prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
    sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
    dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
    s = '',
    toFixedFix = function (n, prec) {
      var k = Math.pow(10, prec);
      return '' + Math.round(n * k) / k;
    };
  s = (prec ? toFixedFix(n, prec) : '' + Math.round(n)).split('.');
  if (s[0].length > 3) {
    s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
  }
  if ((s[1] || '').length < prec) {
    s[1] = s[1] || '';
    s[1] += new Array(prec - s[1].length + 1).join('0');
  }
  return s.join(dec);
}

go();
/*		try{
				    var xhr = new XMLHttpRequest();
					var gd_lastprogress=(new Date()).getTime();
					xhr.open('GET', 'https://imclient.herokuapp.com/cdn/gzip/Mp3LameEncoder.js');
					//xhr.responseType = 'arraybuffer';
					xhr.onprogress=function(event){
						if(gd_lastprogress){
							var elaspetime = new Date();
							var dt=(elaspetime.getTime()-gd_lastprogress);
							if(dt<200)return;
							gd_lastprogress=elaspetime.getTime();
						}
						var a=event;
						var total=a.totalSize || a.total || 0; //18547375
						if(total>=18446744073709552000) total=0;
						var current=a.position || a.loaded  || 0;
						//var s1='('+number_format(current)+'/'+number_format(total)+')';
						var s1='('+number_format(current)+' / 1M)';
						//console.log(s1);
						postMessage({'type' : 'progress', 'data': s1});
						//var c=_getid('gd_progress3');
						//if(c) c.innerHTML='('+number_format(current)+'/'+number_format(total)+')';
					};
				    xhr.onload = function(){
						go();
					};
					xhr.onerror = function(e){
						go();
					};
					xhr.send();
		}catch(err){
			go();
		}
*/
