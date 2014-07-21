/*
 * grunt-shared-config
 *
 * Use this task to create multiple config files for JS/JS-AMD, SCSS/SASS/LESS/stylus from one JSON/YAML.
 *
 * Copyright (c) 2013 Mathias Paumgarten
 * Licensed under the MIT license.
 */

"use strict";

var mout = require( "mout" );
var maskObject = require( "object-mask" );

module.exports = function( grunt ) {

	grunt.registerMultiTask( "shared_config", "Your task description goes here.", function() {

		// ===========
		// -- UTILS --
		// ===========

		function normalizeOutArray( value ) {
			return typeof value === "string" ? [ value ] : value;
		}

		function normalizeFormat( value ) {
			return mout.array.contains( varFormats, value ) ? value : varFormats[ 0 ];
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
			// fetch JSON or YAML from file
			var fileType = filePath.split( "." ).pop().toLowerCase();
			var src;
			if ( fileType === 'yml' || fileType === 'yaml' ) {
				src = grunt.file.readYAML( filePath );
			} else {
				src = grunt.file.readJSON( filePath );
			}
			return src;
		}

		function isStringNumber( value ) {
			var units = [ "em", "px", "s", "in", "mm", "cm", "pt", "pc", "%" ];

			return units.reduce( function( previous, current ) {
				return previous || mout.string.endsWith( value, current );
			}, false );
		}


		// ==============
		// -- SETTINGS --
		// ==============

		// default options
		var options = this.options( {
			amd: false,
			jsFormat: "uppercase",
			cssFormat: "dash",
			name: "config",
			useSassMaps: false,
			indention: "\t",
			mask: undefined,
			maskFile: undefined,
			maskAllowMode: false
		} );

		// possible variable formats
		var varFormats = [ "underscore", "uppercase", "dash", "camelcase" ];

		// available file extensions
		var fileExtensions = {
			js: [ "js" ],
			css: [ "scss", "sass", "less", "styl" ]
		};


		// variable patterns
		var outputPattern = {
			scss:     "${{key}}: {{value}};\n",
			sass:     "${{key}}: {{value}}\n",
			less:     "@{{key}}: {{value}};\n",
			sassmaps: "{{key}}: {{value}},{{next}}",
			styl:     "{{key}} = {{value}}\n",
			amd:      "define( function() {\n\n"+options.indention+"return {{{vars}}"+options.indention+"}\n\n} );\n",
			js:       "var {{name}} = {{vars}};\n"
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
					name = parentKey ? format( parentKey + "-" + key, options.cssFormat ) : format( key, options.cssFormat );

					if ( mout.lang.isObject( data[ key ] ) ) {

						resolveNested( data[ key ], name );

					} else {

						var value = data[ key ];

						if ( ! isStringNumber( value ) && value[ 0 ] !== "#" ) {
							value = "\"" + value + "\"";
						}

						content += pattern.replace( "{{key}}", name ).replace( "{{value}}", value );
					}
				}
			}

			resolveNested( data );

			return content;
		}


		// Generate JavaScript files
		function generateJS( data, type ) {
			var preparedData = prepareValues( data );
			var content = JSON.stringify( preparedData, null, options.indention );

			return outputPattern.js.replace( "{{name}}", options.name ).replace( "{{vars}}", content );
		}

		function generateAMD( data ) {
			var preparedData = prepareValues( data );
			var content = JSON.stringify( preparedData, null, options.indention );
			var pattern = mout.lang.deepClone( outputPattern.amd );

			content = content.substr( 1, content.length - 2 );
			content = indent( content, options.indention );

			return pattern.replace( "{{vars}}", content );
		}

		function generateSassMaps( data ) {
			var pattern = outputPattern["sassmaps"];

			function generateSassMapsRecursive( data, name ) {
				var key;
				var currentItem = "";
				var first = true;
				var sassMapStr;

				for ( key in data ) {

					if ( mout.lang.isObject( data[ key ] ) ) {
						currentItem = generateSassMapsRecursive( data[ key ], key );
					} else {
						currentItem = pattern.replace( "{{key}}", key ).replace( "{{value}}", data[ key ] );
					}

					if ( first ) {
						sassMapStr = indent("\n" + currentItem, options.indention);
						first = false;
					} else {
						sassMapStr = sassMapStr.replace( "{{next}}", indent("\n" + currentItem, options.indention) );
					}
				}

				// when name is passed, it means that we"ve been called by a wrapper object
				if ( name ) {
					return name + ": (" + sassMapStr.replace( "{{next}}", "" ).replace(",)", ")") + "\n)";
				} else {
					return "(" + sassMapStr.replace( "{{next}}", "" ).replace(",)", ")") + "\n)";
				}
			}
			return "$" + options.name + ": " + generateSassMapsRecursive( data ).replace( "{{next}}", "" ).replace( /,\)/g , ")" ) + ";";

		}

		function prepareValues( data ) {
			var newData = {};

			function updateValues( object, newData ) {
				for ( var key in object ) {
					var value = object[ key ];

					if ( mout.lang.isObject( value ) ) {

						var newKey = format( key, options.jsFormat );

						newData[ newKey ] = {};
						updateValues( value, newData[ newKey ] );

						continue;

					} else if ( mout.string.endsWith( value, "%" ) ) {

						value = parseInt( value, 10 ) / 100;

					} else if ( isStringNumber( value ) ) {

						value = parseInt( value, 10 );

					}

					newData[ format( key, options.jsFormat ) ] = value;
				}
			}

			updateValues( data, newData );

			return newData;
		}

		function removeEmptyObjects ( object ) {
			for (var key in object) {
				if ( mout.lang.isObject( object[ key ] ) ) {
					if ( Object.keys( object[ key ] ).length === 0 ) {
						delete object[key];
					} else {
						object[key] = removeEmptyObjects( object[key] );
					}
				}
			}
			return object;
		}

		function indent( content, indention ) {
			content = content.replace( /\n/g, "\n" + indention );

			while ( mout.string.endsWith( content, options.indention ) ) {
				content = content.substr( 0, content.length - 1 );
			}

			return content;
		}

		// ===================
		// -- SHARED CONFIG --
		// ===================

		this.files.forEach( function( file ) {

			var srcConfig = {};
			var destinationFiles = normalizeOutArray( file.dest );

			file.src.filter( fileExists ).map( function( filePath ) {

				var src = readFile( filePath );

				// mask
				var mask = null;
				// if maskFile is given, read it in
				if ( typeof options.maskFile !== "undefined" && fileExists( options.maskFile ) ) {
					mask = readFile( options.maskFile );
				}
				// if mask object is given, merge it with the mask from file if any
				if ( typeof options.mask !== "undefined" && mout.lang.isObject( options.mask )) {
					if ( mask !== null ) {
						mask = mout.object.deepMixIn( mask, options.mask );
					} else {
						mask = options.mask;
					}
				}
				// if this results in a mask, apply it
				if ( mask !== null ) {
					src = maskObject( src, mask, options.maskAllowMode );
					src = removeEmptyObjects( src );
				}

				// add configuration vars to main config
				mout.object.deepMixIn( srcConfig, src );

			} );


			destinationFiles.map( function( filePath ) {

				var fileType = filePath.split( "." ).pop().toLowerCase();
				var output, generator;


				// search for the correct generator by filetype
				if ( fileType === "scss" && options.useSassMaps) {

					generator = generateSassMaps;

				} else if ( mout.array.contains( fileExtensions.css, fileType ) ) {

					generator = generateStyle;

				} else if ( mout.array.contains( fileExtensions.js, fileType ) ) {

					generator = options.amd ? generateAMD : generateJS;

				} else {
					grunt.log.warn( "Unknown filetype (" + fileType + ")." );
					return false;
				}

				// generate and save output
				output = generator.apply( null, [ srcConfig, fileType ] );
				grunt.file.write( filePath, output );

				grunt.log.ok( "File: " + filePath + " created." );
			} );

		} );

	} );

};
