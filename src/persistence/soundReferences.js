export function collectSoundReferences(buzzData) {
	const soundFiles = new Set();

	if (buzzData.sounds) {
		buzzData.sounds.forEach(sound => {
			if (sound.type === 'SoundFile' && sound.params?.soundFile) {
				soundFiles.add(sound.params.soundFile);
			}

			if (sound.type === 'Sampler') {
				if (sound.params?.samplerMode === 'single' && sound.params?.soundFile) {
					soundFiles.add(sound.params.soundFile);
				}

				if (sound.params?.samplerMode === 'grid' && sound.params?.gridSamples) {
					Object.values(sound.params.gridSamples).forEach(sample => {
						if (sample.fileName) {
							soundFiles.add(sample.fileName);
						}
					});
				}
			}
		});
	}

	if (buzzData.sequencers) {
		buzzData.sequencers.forEach(sequencer => {
			if (sequencer.tracks) {
				sequencer.tracks.forEach(track => {
					if (track.instrumentType === 'synth' && track.synthParams) {
						if (track.synthType === 'SoundFile' && track.synthParams.soundFile) {
							soundFiles.add(track.synthParams.soundFile);
						}

						if (track.synthType === 'Sampler') {
							if (track.synthParams.samplerMode === 'single' && track.synthParams.soundFile) {
								soundFiles.add(track.synthParams.soundFile);
							}

							if (track.synthParams.samplerMode === 'grid' && track.synthParams.gridSamples) {
								Object.values(track.synthParams.gridSamples).forEach(sample => {
									if (sample.fileName) {
										soundFiles.add(sample.fileName);
									}
								});
							}
						}
					}
				});
			}
		});
	}

	return Array.from(soundFiles);
}

export function toSoundBaseName(reference) {
	return reference.replace(/^sounds\//, '');
}
