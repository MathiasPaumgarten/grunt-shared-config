/*
 * grunt-shared-config
 *
 * Use this task to create multiple config files for JS/JS-AMD, SCSS/SASS/LESS/stylus from one JSON/YAML.
 *
 * Copyright (c) 2013 Mathias Paumgarten
 * Licensed under the MIT license.
 */

var mout = require( "mout" );

module.exports = function( grunt ) {
	"use strict";

	grunt.registerMultiTask( "shared_config", "Your task description goes here.", function() {

		// ===========
		// -- UTILS --
		// ===========

		function normalizeOutArray( value ) {
			return typeof value === "string" ? [ value ] : value;
		}

		function normalizeArrayValue( array, elementFunc, separator ) {
			var result = "";
			for ( var i = 0; i < array.length; i++ ) {
				if ( result.length > 0 ) {
					result += separator;
				}
				result += elementFunc( array[ i ] );
			}
			return result;
		}

		function normalizeFormat( value ) {
			return mout.array.contains( varFormats, value ) ? value : varFormats[ 0 ];
		}

		function normalizeMask( mask ) {
			/*jshint eqnull:true */
			if ( mask == null ) return null;

			if ( mout.lang.isString( mask ) && fileExists( mask ) ) return readFile( mask );
			else if ( mout.lang.isObject( mask ) ) return mask;
			else if ( mout.lang.isArray( mask ) ) {

				return mask.reduce( function( previous, current ) {
					return mout.object.deepMixIn( previous, normalizeMask( current ) );
				}, {} );

			}

			return {};
		}

		function format( value, type ) {
			value = value.replace( /-/g, " " );

			switch ( type ) {
				case "underscore":
					return mout.string.underscore( value );
				case "uppercase":
					return value.toUpperCase().replace( / /g, "_" );
				case "dash":
					return mout.string.hyphenate( value );
				default:
					return mout.string.camelCase( value );
			}
		}

		function fileExists( filePath ) {
			if ( !grunt.file.exists( filePath ) ) {
				grunt.log.warn( "Source file (" + filePath + ") not found." );
				return false;
			}
			return true;
		}

		function readFile( filePath ) {
			var fileType = filePath.split( "." ).pop().toLowerCase();

			return ( ( fileType === "yml" || fileType === "yaml" ) ? grunt.file.readYAML : grunt.file.readJSON )( filePath );
		}

		function isStringNumber( value ) {
			// The value must start with a numeric value in the first place.
			if ( !numberRegex.test( String( value ).trim() ) ) {
				return false;
			}
			var units = [ "em", "px", "s", "in", "mm", "cm", "pt", "pc", "%" ];

			return units.reduce( function( previous, current ) {
				return previous || mout.string.endsWith( value, current );
			}, false );
		}

		function isPathExpression( value ) {
			return new RegExp(
				"^(" +
				// full URL
				/// protocol identifier
				"(?:(?:https?|ftp)://)" +
				/// user:pass authentication
				"(?:\\S+(?::\\S*)?@)?" +
				"(?:" +
				/// IP address exclusion
				/// private & local networks
				"(?!(?:10|127)(?:\\.\\d{1,3}){3})" +
				"(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})" +
				"(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})" +
				/// IP address dotted notation octets
				/// excludes loopback network 0.0.0.0
				/// excludes reserved space >= 224.0.0.0
				/// excludes network & broacast addresses
				/// (first & last IP address of each class)
				"(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])" +
				"(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}" +
				"(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))" +
				"|" +
				/// host name
				"(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)" +
				/// domain name
				"(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*" +
				/// TLD identifier
				"(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))" +
				")" +
				/// port number
				"(?::\\d{2,5})?" +
				/// resource path
				"(?:/\\S*)?" +
				"|" +
				/// or PATH
				"([\\w\\/]?(?:\\/[\\w\\.\\-]+)+)" +
				")$", "i"
			).test( value );
		}
		var numberRegex = /^\-?([0-9]+|[0-9]*\.[0-9]+)/;

		function isBooleanExpression( value ) {
			return ( /^true$/i ).test( value );
		}

		function isStringExpression( value ) {
			return ( /^[\'\"].*[\'\"]$/i ).test( value );
		}

		function getStyleSafeValue( value ) {
			if ( isStringExpression( value ) ) {
				value = "\"" + value.substr( 1, value.length - 2 ) + "\"";
			} else if ( isPathExpression( value ) ) {
				value = "\"" + value + "\"";
			} else if ( isBooleanExpression( value ) && typeof value === "string" ) {
				value = "\"" + value + "\"";
			} else if ( mout.lang.isArray( value ) ) {
				value = normalizeArrayValue( value, getStyleSafeValue, ", " );
			} else if ( mout.lang.isObject( value ) ) {
				// nested (!) objects don't have a representation in this language.
				value = null;
			}

			return value;
		}

		function getSassSafeValue( value ) {
			if ( mout.lang.isArray( value ) ) {
				var arrayString = normalizeArrayValue( value, getSassSafeValue, ', ' );
				return '(' + arrayString + ')';
			} else if ( mout.lang.isObject( value ) ) {
				return generateSassMapsRecursive( value );
			}
			return getStyleSafeValue( value );
		}



		// ==============
		// -- SETTINGS --
		// ==============

		// default options
		var options = this.options( {
			ngconstant: false,
			amd: false,
			jsFormat: "uppercase",
			cssFormat: "dash",
			singlequote: false,
			name: "config",
			module: "globalConfig.sharedConfig",
			newModule: true,
			useSassMaps: false,
			indention: "\t",
			mask: undefined,
			maskAllowUnknownLevels: 0,
			namespace: ""
		} );

		// possible variable formats
		var varFormats = [ "underscore", "uppercase", "dash", "camelcase" ];

		// available file extensions
		var fileExtensions = {
			js: [ "js" ],
			css: [ "scss", "sass", "less", "styl" ]
		};

		// variable converters
		var styleConverter = {
			scss: getSassSafeValue,
			sass: getSassSafeValue
		};

		// variable patterns
		var outputPattern = {
			scss: "${{key}}: {{value}};\n",
			sass: "${{key}}: {{value}}\n",
			less: "@{{key}}: {{value}};\n",
			sassmaps: "{{key}}: {{value}},",
			styl: "{{key}} = {{value}}\n",
			amd: "define( function() {\n\n" + options.indention + "return {{{vars}}" + options.indention + "}\n\n} );\n",
			ngconstant: "angular.module(\"{{module}}\"" + ( options.newModule ? ", []" : "" ) + ")\n" + options.indention + ".constant(\"{{name}}\", {{{vars}}" + options.indention + "});",
			js: "var {{name}} = {{vars}};\n"
		};

		// Normalize user input
		options.dest = normalizeOutArray( options.dest );
		options.jsFormat = normalizeFormat( options.jsFormat );
		options.cssFormat = normalizeFormat( options.cssFormat );


		// ================
		// -- GENERATORS --
		// ================

		// Generate Style files
		function generateStyle( data, type ) {
			var content = "";
			var pattern = outputPattern[ type ];

			function resolveNested( data, parentKey ) {
				var name, key;
				for ( key in data ) {
					if ( data.hasOwnProperty( key ) ) {
						name = parentKey ? format( parentKey + "-" + key, options.cssFormat ) : format( key, options.cssFormat );

						if ( mout.lang.isObject( data[ key ] ) ) {

							resolveNested( data[ key ], name );

						} else {
							var converter = styleConverter[ type ] || getStyleSafeValue;
							var value = converter( data[ key ] );

							content += pattern.replace( "{{key}}", options.namespace + name ).replace( "{{value}}", value );
						}
					}
				}
			}

			resolveNested( data );

			return content;
		}


		// Generate JavaScript files
		function generateJS( data ) {
			var preparedData = prepareValues( data );
			var content = JSON.stringify( preparedData, null, options.indention );

			var output = outputPattern.js.replace( "{{name}}", options.name ).replace( "{{vars}}", content );
			return options.singlequote ? output.replace( /"/g, "'" ) : output;
		}

		function generateJSON( data ) {
			var preparedData = prepareValues( data );

			var content = JSON.stringify( preparedData, null, options.indention );
			return options.singlequote ? content.replace( /"/g, "'" ) : content;
		}

		function generateAMD( data ) {
			var preparedData = prepareValues( data );
			var content = JSON.stringify( preparedData, null, options.indention );
			var pattern = mout.lang.deepClone( outputPattern.amd );

			content = content.substr( 1, content.length - 2 );
			content = indent( content, options.indention );

			return pattern.replace( "{{vars}}", content );
		}

		function generateNGConstant( data ) {
			var preparedData = prepareValues( data );
			var content = JSON.stringify( preparedData, null, options.indention );
			var pattern = mout.lang.deepClone( outputPattern.ngconstant );

			content = content.substr( 1, content.length - 2 );
			content = indent( content, options.indention );

			var output = pattern.replace( "{{module}}", options.module )
				.replace( /\{\{name\}\}/g, options.name ).replace( "{{vars}}", content );

			return options.singlequote ? output.replace( /"/g, "'" ) : output;
		}

		function generateSassMapsRecursive( data ) {
			var key;
			var currentItem = "";
			var first = true;
			var sassMapStr = "";
			var currentValue;
			var pattern = outputPattern.sassmaps;

			if ( mout.lang.isObject( data ) ) {
				for ( key in data ) {
					currentValue = generateSassMapsRecursive( data[ key ] );
					currentItem = pattern.replace( "{{key}}", key ).replace( "{{value}}", currentValue );

					if ( first ) {
						sassMapStr = indent( "\n" + currentItem, options.indention );
						first = false;
					} else {
						sassMapStr = sassMapStr + indent( "\n" + currentItem, options.indention );
					}

					sassMapStr = sassMapStr.replace( ",\n" + options.indention + ")", "\n" + options.indention + ")" );
				}
			} else if ( mout.lang.isArray( data ) ) {
				var arrayString = normalizeArrayValue( data, generateSassMapsRecursive, ', ' );
				return '(' + arrayString + ')';
			} else {
				return getStyleSafeValue( data );
			}

			// the slice removes the last comma
			return "(" + sassMapStr.slice( 0, -1 ) + "\n)";
		}

		function generateSassMaps( data ) {
			return "$" + options.name + ": " + generateSassMapsRecursive( data ).replace( /,\)/g, ")" ) + ";";

		}

		function prepareValues( data ) {
			var newData;

			if ( mout.lang.isObject( data ) ) {
				newData = {};
				for ( var key in data ) {
					if ( data.hasOwnProperty( key ) ) {
						var value = data[ key ];
						var newKey = format( key, options.jsFormat );
						newData[ newKey ] = prepareValues( value );
					}
				}

			} else if ( mout.lang.isArray( data ) ) {
				newData = [];
				for ( var i = 0; i < data.length; i++ ) {
					newData[ i ] = prepareValues( data[ i ] );
				}

			} else if ( mout.string.endsWith( data, "%" ) ) {
				newData = parseInt( data, 10 ) / 100;

			} else if ( isStringNumber( data ) ) {
				newData = parseInt( data, 10 );

			} else if ( isStringExpression( data ) ) {
				newData = data.substr( 1, data.length - 2 );
			} else {
				newData = data;
			}

			return newData;
		}

		function indent( content, indention ) {
			content = content.replace( /\n/g, "\n" + indention );

			while ( mout.string.endsWith( content, options.indention ) ) {
				content = content.substr( 0, content.length - 1 );
			}

			return content;
		}

		function getLevelsFromObject( src, numberOfLevels ) {
			var result = {};

			if ( numberOfLevels === 0 ) return result;

			if ( !mout.lang.isObject( src ) ) return src;


			for ( var key in src ) {

				if ( numberOfLevels === 1 ) {

					// only add it to result if it's not an object
					// we don't want empty objects in the result
					if ( !mout.lang.isObject( src[ key ] ) ) {

						result[ key ] = src[ key ];

					}

				} else {

					result[ key ] = getLevelsFromObject( src[ key ], numberOfLevels - 1 );

				}
			}

			return result;
		}

		function maskObject( src, mask, allowLevel, round ) {
			var result = {};

			// check for every key in src, if it should end up in the result
			for ( var key in src ) {

				// if this property is in the mask too, check that
				if ( mask.hasOwnProperty( key ) ) {

					// if this mask is an object, send it through maskObject again
					if ( mout.lang.isObject( mask[ key ] ) ) {

						// we allow to include unknown objects only on the root level
						// on every other level, you can just use "true"
						result[ key ] = maskObject( src[ key ], mask[ key ], allowLevel, round + 1 );

					} else {

						// true, include everything in result
						if ( mask[ key ] === true ) {
							result[ key ] = src[ key ];

						} else {

							// if the mask value starts with 'allowLevel-' we get the number after '-' and allow as many levels
							if ( typeof mask[ key ] === "string" && mask[ key ].split( "-" )[ 0 ] === "allowLevel" ) {

								var numberOfLevels = parseInt( mask[ key ].split( "-" )[ 1 ], 10 );

								if ( isNaN( numberOfLevels ) ) {

									grunt.log.error( "invalid mask value: " + mask[ key ] );

								} else {

									result[ key ] = getLevelsFromObject( src[ key ], numberOfLevels );

								}

							} else if ( mask[ key ] !== false ) {

								grunt.log.error( "invalid mask value: " + mask[ key ] );

							}
						}
					}
					// otherwise we only include it, if other first level object should end up in the result
				} else if ( allowLevel > round ) {

					result[ key ] = src[ key ];

				}
			}

			return result;
		}


		// ===================
		// -- SHARED CONFIG --
		// ===================

		this.files.forEach( function( file ) {

			var srcConfig = {};
			var destinationFiles = normalizeOutArray( file.dest );
			var mask = normalizeMask( options.mask );

			file.src.filter( fileExists ).forEach( function( filePath ) {

				mout.object.deepMixIn( srcConfig, readFile( filePath ) );

			} );

			if ( mask !== null ) {

				srcConfig = maskObject( srcConfig, mask, options.maskAllowUnknownLevels, 0 );

			}

			if ( Object.keys( srcConfig ).length === 0 ) {
				grunt.log.warn( "Empty src results in no output" );
				return false;
			}

			destinationFiles.map( function( filePath ) {

				var fileType = filePath.split( "." ).pop().toLowerCase();
				var output, generator;

				if ( fileType === "scss" && options.useSassMaps ) {

					generator = generateSassMaps;

				} else if ( fileType === "json" ) {

					generator = generateJSON;

				} else if ( mout.array.contains( fileExtensions.css, fileType ) ) {

					generator = generateStyle;

				} else if ( mout.array.contains( fileExtensions.js, fileType ) ) {

					if ( options.amd ) {

						generator = generateAMD;

					} else if ( options.ngconstant ) {

						generator = generateNGConstant;

					} else {

						generator = generateJS;
					}

				} else {
					grunt.log.warn( "Unknown filetype (" + fileType + ")." );
					return false;
				}

				output = generator.apply( null, [ srcConfig, fileType ] );
				grunt.file.write( filePath, output );

				grunt.log.ok( "File: " + filePath + " created." );
			} );

		} );

	} );

};