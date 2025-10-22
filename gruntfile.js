// import typescript from "rollup-plugin-typescript2";

module.exports = function (grunt) {
	// Load npm tasks
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-file-append');
	grunt.loadNpmTasks('grunt-rollup');
	grunt.loadNpmTasks('grunt-screeps');
	grunt.loadNpmTasks('grunt-env');
	grunt.loadNpmTasks('grunt-ts');

	// Load plugins
	const typescript = require("rollup-plugin-typescript2");
	const resolve = require('@rollup/plugin-node-resolve');
	const commonjs = require('@rollup/plugin-commonjs');
	const progress = require("rollup-plugin-progress");
	const fs = require('fs');

	// Config
	var config = {};
	if (fs.existsSync('./.screeps.json')) {
		config = require('./.screeps.json');
	}
	var branch = grunt.option('branch') || config.branch;
	var email = grunt.option('email') || config.email;
	var token = grunt.option('token') || config.token;
	var ptr = grunt.option('ptr') ? true : config.ptr;

	const ignoreWarnings = [
		'commonjs-proxy',
		'Circular dependency',
		"The 'this' keyword is equivalent to 'undefined'",
		"Use of eval is strongly discouraged"
    ];

    grunt.initConfig({
        clean: {
            'dist': ['dist/']
        },

        rollup: {
            options: {
                format: 'cjs',
                sourcemap: false,
                input: 'src/main.ts',
                plugins: [
                    progress({ clearLine: true }),
                    resolve(),
                    commonjs({
                        namedExports: {
                            'src/Overmind': ['_Overmind'],
                            'screeps-profiler': ['profiler'],
                            'columnify': ['columnify']
                        }
                    }),
                    typescript({ tsconfig: "./tsconfig.json" }),
                ],
                output: {
                    file: "dist/main.js",
                    format: "cjs",
                    sourcemap: false,
                },
                onwarn: function (warning) {
                    // Skip default export warnings from using obfuscated overmind file in main
                    for (let ignoreWarning of ignoreWarnings) {
                        if (warning.toString().includes(ignoreWarning)) {
                            return;
                        }
                    }
                    // console.warn everything else
                    console.warn(warning.message);
                },
                treeshake: false,
            },

            dist: {
                files: {
                    'dist/main.js': 'src/main.ts'
                }
            }
        },

        screeps: {
            options: {
                email: email,
                token: token,
                branch: branch,
                ptr: ptr,
            },
            dist: {
                src: ['dist/*.js']
            }
        },
    });

    grunt.registerTask('default', ['clean', 'rollup','screeps']);
};
