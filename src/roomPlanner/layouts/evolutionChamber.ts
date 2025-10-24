import {StructureLayout} from '../RoomPlanner';

export const evolutionChamberLayout: StructureLayout = {
	data: {
		anchor: {'x': 25, 'y': 25}
	},
	6   : {
		'name'     : 'bunkerCore',
		'shard'    : 'shard2',
		'rcl'      : '6',
		'buildings': {
			'lab': {
				'pos': [{'x': 27, 'y': 25}, {'x': 27, 'y': 24}, {'x': 26, 'y': 24},]
			},
		}
	},
	7   : {
		'name'     : 'bunkerCore',
		'shard'    : 'shard2',
		'rcl'      : '7',
		'buildings': {
			'lab': {
				'pos': [{'x': 27, 'y': 25}, {'x': 27, 'y': 24}, {'x': 26, 'y': 24},
					{'x': 24, 'y': 24}, {'x': 25, 'y': 25}, {'x': 26, 'y': 26},]
			},
		}
	},
	8   : {
		'name'     : 'bunkerCore',
		'shard'    : 'shard2',
		'rcl'      : '8',
		'buildings': {
			'lab': {
				'pos': [{'x': 27, 'y': 25}, {'x': 27, 'y': 24}, {'x': 26, 'y': 24},
					{'x': 24, 'y': 24}, {'x': 25, 'y': 25}, {'x': 26, 'y': 26},
					{'x': 27, 'y': 27}, {'x': 24, 'y': 27}, {'x': 25, 'y': 27}, {'x': 24, 'y': 26},]
			},
		}
	}
};
