module.exports = function (grunt) {
	const fs = require('fs');
	const typescript = require('rollup-plugin-typescript2');
	const resolve = require('@rollup/plugin-node-resolve');
	const commonjs = require('@rollup/plugin-commonjs');
	const progress = require('rollup-plugin-progress');

	// Load npm tasks
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-file-append');
	grunt.loadNpmTasks('grunt-rollup');
	grunt.loadNpmTasks('grunt-screeps');
	grunt.loadNpmTasks('grunt-env');
	grunt.loadNpmTasks('grunt-ts');

	// Load configuration from .screeps.json if it exists
	const loadConfig = () => {
		const configPath = './.screeps.json';
		if (fs.existsSync(configPath)) {
			return require(configPath);
		}
		return {};
	};

	const config = loadConfig();

	// Configuration options with fallbacks
	const getOption = (name, defaultValue = undefined) => {
		return grunt.option(name) || config[name] || defaultValue;
	};

	const branch = getOption('branch');
	const email = getOption('email');
	const token = getOption('token');
	const ptr = grunt.option('ptr') ? true : (config.ptr || false);

	// Warnings to ignore during rollup
	const IGNORED_WARNINGS = [
		'commonjs-proxy',
		'Circular dependency',
		"The 'this' keyword is equivalent to 'undefined'",
		'Use of eval is strongly discouraged'
	];

	// Check if warning should be ignored
	const shouldIgnoreWarning = (warning) => {
		const warningString = warning.toString();
		return IGNORED_WARNINGS.some(ignored => warningString.includes(ignored));
	};

	// Rollup plugins configuration
	const getRollupPlugins = () => [
		progress({ clearLine: true }),
		resolve(),
		commonjs({
			namedExports: {
				'src/Overmind': ['_Overmind'],
				'screeps-profiler': ['profiler'],
				'columnify': ['columnify']
			}
		}),
		typescript({ tsconfig: './tsconfig.json' }),
	];

	// Grunt task configuration
	grunt.initConfig({
		clean: {
			dist: ['dist/']
		},

		rollup: {
			options: {
				format: 'cjs',
				sourcemap: false,
				input: 'src/main.ts',
				plugins: getRollupPlugins(),
				output: {
					file: 'dist/main.js',
					format: 'cjs',
					sourcemap: false,
				},
				onwarn: (warning) => {
					if (!shouldIgnoreWarning(warning)) {
						console.warn(warning.message);
					}
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

	// Register default task
	grunt.registerTask('default', ['clean', 'rollup', 'screeps']);
};
