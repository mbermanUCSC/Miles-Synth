import { kick1, snare1, hihat1, tom1, bell1, kick2, snare2, hihat2, tom2, bell2, kick3, snare3, hihat3, tom3, bell3,
    kick4, snare4, hihat4, tom4, bell4 } from './drumKits.js';

document.addEventListener('DOMContentLoaded', function () {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playButton = document.getElementById('play');
    const bpmInput = document.getElementById('bpm');
    const sequences = document.querySelectorAll('.sequence');
    let isPlaying = false;
    let nextNoteTime = audioCtx.currentTime;
    let currentBeat = 0;
    let bpm = 120;
    let division = 2;
    let swingAmount = 0.0; 
    const notesInQueue = []; // tracks the notes that are scheduled
    let requestID;
    let bpmLocked = false;

    let samples = {};
    let activeSources = [];
    let currentDrumType = null;
    let drumKit = 0;

    let waveform = 'sine';
    let keys = [];
    let touchSynth = false;
    let synthMode = 'weighted';

    let samplerSample = null;
    let sampleStart = 0;
    let sampleEnd = 0;

    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false; // Track recording state

    let notes = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
    let song = {};

    // Master gain for overall volume control
    const masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = 0.8; // master volume here

    const synthGain = audioCtx.createGain();
    const drumGain = audioCtx.createGain();
    const samplerGain = audioCtx.createGain();

    synthGain.connect(masterGain);
    drumGain.connect(masterGain);
    samplerGain.connect(masterGain);

    synthGain.gain.value = 0.8;
    drumGain.gain.value = 0.8;
    samplerGain.gain.value = 0.8;


    

    function playSound(sound, time) {
        if (samples[sound]) { // check if sound is in samples
            playSample(samples[sound], time);
            return;
        }

        if (sound === "kick") playKick(time);
        else if (sound === "snare") playSnare(time);
        else if (sound === "hihat") playHiHat(time);
        else if (sound === "tom") playTom(time);
        else if (sound === "sample") samplerTrigger(time);
        
        else if (!document.getElementById('extra-drums').checked) return;
        else if (sound === "bell") playBell(time, getFrequency(document.querySelector('.transpose-key').textContent.toLowerCase(), 2));
        
    }

    // highlight the current beat
    function updateCurrentBeatIndicator() {
        document.querySelectorAll('.sequence button').forEach(button => {
            button.classList.remove('current-beat');
        });

        sequences.forEach(sequence => {
            const buttons = sequence.querySelectorAll('button');
            if (buttons[currentBeat]) {
                buttons[currentBeat].classList.add('current-beat');
            }
        });
    }
    

    // NOTE SCHEDULING FUNCTIONS //

    function scheduleNote() {
        sequences.forEach((seq, index) => {
            const soundButtons = seq.querySelectorAll('button');
            const sound = soundButtons[currentBeat].classList.contains('button-active') ? seq.dataset.sound : null;
    
            // Calculate swing delay
            let swingDelay = 0;
            if (currentBeat % 2 !== 0) { // Apply swing to every second beat
                swingDelay = (60.0 / bpm / division) * swingAmount;
            }
    
            if (sound) {
                playSound(sound, nextNoteTime + swingDelay);
            }
        });
    
        // if there are keys selected, sequence synth
        if (keys.length > 0 && !touchSynth) {
            sequenceSynth(nextNoteTime);
        }
    
        updateCurrentBeatIndicator();
    
        // Do not add swing delay to nextNoteTime here, it's only applied when scheduling notes
        const secondsPerBeat = 60.0 / bpm / division;
        nextNoteTime += secondsPerBeat;
        currentBeat = (currentBeat + 1) % sequences[0].querySelectorAll('button').length;
    }
    

    function scheduler() {
        if (!isPlaying) return;
        while (nextNoteTime < audioCtx.currentTime + 0.1) {
            scheduleNote();
        }
        requestAnimationFrame(scheduler);
    }

    // Handle window focus and blur for audio context
    window.addEventListener('blur', function() {
        audioCtx.suspend();
    });

    window.addEventListener('focus', function() {
        audioCtx.resume();
    });

    sequences.forEach(sequence => {
        sequence.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', function() {
                this.classList.toggle('button-active');
            });
        });
    });


    

    // SEQUENCER CONTROLS //

    function startSequencer() {
        if (!isPlaying) {
            isPlaying = true;
            currentBeat = 0;
            nextNoteTime = audioCtx.currentTime + 0.05; // short delay before starting for accuracy (idk why)
            playButton.textContent = '||';
            scheduler();
        }
    }

    function stopSequencer() {
        if (isPlaying) {
            isPlaying = false;
            cancelAnimationFrame(requestID);
            currentBeat = 0; 
            updateCurrentBeatIndicator(); 
            playButton.textContent = '▶';
            // stop sampler
            activeSources.forEach(source => {
                source.stop();
            });
        }
    }
    
    // play/pause button
    playButton.addEventListener('click', function() {
        if (isPlaying) {
            // set the text to ||
            playButton.textContent = '▶';
            stopSequencer();
        } else {
            playButton.textContent = '||';
            startSequencer();
        }
    });

    // bpm input
    bpmInput.addEventListener('input', function() {
        if (bpmInput.value <3) return;
        bpm = Number(bpmInput.value);
    });

    // reset button
    document.getElementById('reset').addEventListener('click', function() {
        sequences.forEach(sequence => {
            sequence.querySelectorAll('button').forEach(button => {
                button.classList.remove('button-active');
            });
            // clear bpm
            if (!bpmLocked){
                bpmInput.value = 120;
            }
            
            // clear division
            document.getElementById('division').checked = false;
            division = 2;

            // clear any current sound in the buffer (dont close the audio context)
            activeSources.forEach(source => {
                source.stop();
            });
            activeSources = [];

            samples = {};
            // clear the sample buttons
            document.querySelectorAll('.add-sample-button').forEach(button => {
                button.textContent = 'file';
            });

            // clear the synth keys
            keys = [];
            resetActiveKeys();

            // clear the synth waveform
            document.querySelectorAll('.waveform').forEach(button => {
                button.style.opacity = '0.5';
            });
            document.getElementById('sine').style.opacity = '1';
            waveform = 'sine';

            // clear the swing
            document.getElementById('swing').value = 0;
            swingAmount = 0;

            // reset all gains
            masterGain.gain.value = 0.8;
            synthGain.gain.value = 0.8;
            drumGain.gain.value = 0.8;
            samplerGain.gain.value = 0.8;
            // reset gain sliders
            document.getElementById('master').value = 80;
            document.getElementById('synth').value = 80;
            document.getElementById('drums').value = 80;

            // reset song
            song = {};

            // reset the extra drums checkbox
            document.getElementById('extra-drums').checked = false;
            document.querySelector('.extra-drums').style.display = 'none';

            // reset the kit select
            document.getElementById('kit-select').selectedIndex = 0;
            drumKit = 0;

            // reset the synth mode
            document.getElementById('weighted-synth').checked = false;
            synthMode = 'weighted';

            // reset the touch synth
            document.getElementById('touch-synth').checked = false;
            touchSynth = false;

            // reset the transpose buttons
            document.querySelectorAll('.transpose').forEach(button => {
                button.style.opacity = '1';
            });

            // reset the transpose key
            document.querySelector('.transpose-key').textContent = 'C';

            // Stop recording
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Stop the media stream
            isRecording = false;
            document.querySelector('.sampler-record').textContent = 'Rec';

            activeSources.forEach(source => {
                source.stop();
            });

            // reset the sampler
            samplerSample = null;
            sampleStart = 0;
            sampleEnd = 1;

            // reset the sample waveform
            const canvas = document.getElementById('sample-waveform');
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);

            // reset the sample file text
            document.querySelector('.sampler-file-txt').textContent = 'file';
            document.getElementById('sample-start').value = 0;

            // reset the pitch shift
            document.getElementById('sample-pitch').value = 0;
        });
    });

    // master volume control
    document.getElementById('master').addEventListener('input', function() {
        const value = this.value;
        masterGain.gain.value = value / 100; // Convert percentage to a value between 0 and 1
    });

    // synth volume control
    document.getElementById('synth').addEventListener('input', function() {
        const value = this.value;
        synthGain.gain.value = value / 100; // Convert percentage to a value between 0 and 1
    });

    // drum volume control
    document.getElementById('drums').addEventListener('input', function() {
        const value = this.value;
        drumGain.gain.value = value / 100; // Convert percentage to a value between 0 and 1
    });

    // sampler volume control
    document.getElementById('sampler').addEventListener('input', function() {
        const value = this.value;
        samplerGain.gain.value = value / 100; // Convert percentage to a value between 0 and 1
    });

    // shuffle button
    document.getElementById('shuffle').addEventListener('click', function() {
        // randomly set the bpm between 60 and 140
        if (!bpmLocked){
            bpm = Math.floor(Math.random() * 80) + 60;
            bpmInput.value = bpm;
        }
        // reset all buttons
        sequences.forEach(sequence => {
            sequence.querySelectorAll('button').forEach(button => {
                // if not sample pad, reset
                if (!button.classList.contains('sample')) {
                    button.classList.remove('button-active');
                }
            });
        });

        // randomly activate buttons (favor hihat)
        sequences.forEach(sequence => {
            let i = 0;
            sequence.querySelectorAll('button').forEach(button => {
                // if class is hi hat, activate 50% of the time
                if (button.classList.contains('hihat')) {
                    if (Math.random() > 0.3) {
                        button.classList.add('button-active');
                    }
                }
                else if (button.classList.contains('tom')) {
                    if (Math.random() > 0.9) {
                        button.classList.add('button-active');
                    }
                }
                else if (button.classList.contains('kick')) {
                    if (Math.random() > 0.9) {
                        button.classList.add('button-active');
                    }
                    // bar %4
                    if (i % 4 === 0) {
                        if (Math.random() > 0.7) {
                            button.classList.add('button-active');
                        }
                    }
                    if (i === 0) {
                        if (Math.random() > 0.8) {
                            button.classList.add('button-active');
                        }
                    }
                }
                else if (button.classList.contains('snare')) {
                    if (Math.random() > 0.9) {
                        button.classList.add('button-active');
                    }
                    // bar %2
                    if (i % 2 === 0) {
                        if (Math.random() > 0.7) {
                            button.classList.add('button-active');
                        }
                    }
                }
                // and extra drums are checked
                else if (button.classList.contains('tom') || document.getElementById('extra-drums').checked){
                    if (Math.random() > 1) {
                        button.classList.add('button-active');
                    }
                    // i % 2,4 != 0 
                    if (i % 2 !== 0 && i % 4 !== 0) {
                        if (Math.random() > 0.8) {
                            button.classList.add('button-active');
                        }
                    }
                }
                i += 1;
            });
        });
    });
    

    // bpm lock checkbox
    document.getElementById('bpm-lock').addEventListener('change', function() {
        bpmInput.disabled = this.checked;
        bpmLocked = this.checked;
    });

    // checkbox for division
    document.getElementById('division').addEventListener('change', function() {
        division = this.checked ? 4 : 2;
    });

    // swing slider
    document.getElementById('swing').addEventListener('input', function() {
        swingAmount = this.value / 100;
    });

    // page buttons
    document.querySelectorAll('.page-button').forEach(button => {
        button.addEventListener('click', function() {
            // get id of button
            const id = this.id;
            if (id === 'drum-icon') {
                document.querySelector('.sequencer').style.display = 'block';
                document.querySelector('.synth').style.display = 'none';
                document.querySelector('.sampler').style.display = 'none';
            } else if (id === 'synth-icon') {
                document.querySelector('.sequencer').style.display = 'none';
                document.querySelector('.synth').style.display = 'block';
                document.querySelector('.sampler').style.display = 'none';
            }
            else if (id === 'sampler-icon') {
                document.querySelector('.sequencer').style.display = 'none';
                document.querySelector('.synth').style.display = 'none';
                document.querySelector('.sampler').style.display = 'block';
            }
            // set opacity to 1
            document.querySelectorAll('.page-button').forEach(button => {
                button.style.opacity = '0.5';
            });
            this.style.opacity = '1';
        });
    });

    // initially set the sequencer to display and the other icons to 0.5 opacity
    document.querySelector('.sequencer').style.display = 'block';
    document.querySelector('.synth').style.display = 'none';
    document.querySelector('.sampler').style.display = 'none';
    document.getElementById('drum-icon').style.opacity = '1';
    document.getElementById('synth-icon').style.opacity = '0.5';
    document.getElementById('sampler-icon').style.opacity = '0.5';



    // SEQUENCER SAMPLE + EXTRA DRUM FUNCTIONS //

    document.querySelectorAll('.add-sample-button').forEach(button => {
        button.addEventListener('click', function() {
            let currentButton = this;
            currentDrumType = Array.from(this.classList).find(cls => cls !== 'add-sample-button');
            
            // Create and trigger the file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
            input.onchange = e => {
                const file = e.target.files[0];
                currentButton.textContent = file.name;
                const reader = new FileReader();
                reader.onload = fileEvent => {
                    const arrayBuffer = fileEvent.target.result;
                    audioCtx.decodeAudioData(arrayBuffer, decodedData => {
                        // Store the decoded buffer with the current drum type as the key
                        samples[currentDrumType] = decodedData;
                    }, error => {
                        console.error("Error decoding audio data: ", error);
                        // Reset the button + give the user a message
                        currentButton.textContent = 'file';
                        alert('Error decoding audio data. Please try a different file.');
                    });
                };
                reader.readAsArrayBuffer(file);
            };
            input.click();
        });
    });

    document.getElementById('extra-drums').addEventListener('change', function() {
        const extraDrums = document.querySelector('.extra-drums');
        if (this.checked) {
            extraDrums.style.display = 'block';
        } else {
            extraDrums.style.display = 'none';
            // remove the samples from the samples object
            for (let key in samples) {
                if (key !== 'kick' && key !== 'snare' && key !== 'hihat') {
                    delete samples[key];
                }
            }
            // remove the selected seqeunce buttons
            // for every row past the first 4, remove the buttons
            sequences.forEach((sequence, index) => {
                if (index > 3) {
                    sequence.querySelectorAll('button').forEach(button => {
                        button.classList.remove('button-active');
                    });
                }
            });
        }
    });

    // set the initial state of the extra drums
    document.getElementById('extra-drums').checked = false;
    document.querySelector('.extra-drums').style.display = 'none';



    // DRUM KIT FUNCTIONS //

    // set drumkit to the value of the select
    document.getElementById('kit-select').addEventListener('change', function() {
        drumKit = this.selectedIndex;
    });




    // SYNTH FUNCTIONS //

    class Note {
        constructor(note, octave) {
            this.note = note;
            this.octave = octave;
            this.weight = 1.0;
        }
    }

    function weightedSynth() {
        let swingDelay = (currentBeat % 2 !== 0) ? (60.0 / bpm / division) * swingAmount : 0;
        // for key in key create a key node and each with a synapse
        for (let i = 0; i < keys.length; i++) {
            if (!song[keys[i]]) {
                song[keys[i]] = new Note(keys[i], 0);
            }
        }
        // sort the song by weight
        let sortedSong = Object.values(song).sort((a, b) => b.weight - a.weight);

        let rootNote = sortedSong[0].note;

        //play root as a bass note
        if (currentBeat % 2 === 0) {
            playNote(rootNote, nextNoteTime, -1);
        }
        
        // every 4 beats
        if (currentBeat % 4 === 0) {
        
            // make chord from root note
            // use the circle of fifths and the notes list to get the notes in the chord
            // root, third, fifth
            let chord = [rootNote, notes[(notes.indexOf(rootNote) + 4) % notes.length], notes[(notes.indexOf(rootNote) + 7) % notes.length]];

            // play the chord
            // if inverted bool
            let inverted = Math.random() > 0.5;
            chord.forEach((note, index) => {
                if (inverted && Math.random() > 0.5){
                    playNote(note, nextNoteTime, 0);
                    inverted = false;
                }
                if (Math.random() > 0.2) {
                    playNote(note, nextNoteTime+swingDelay, 1);
                }
                else {
                    playNote(note, nextNoteTime+(swingDelay/2), 0);
                }
            });
        }

        // semi-random melody
        if (Math.random() > 0.8) {
            // based on circle of fifths
            let melody = [notes[(notes.indexOf(rootNote) + 2) % notes.length]]
            melody.forEach(note => {
                playNote(note, nextNoteTime+swingDelay, 2);
            });

        }

        // update the weights
        for (let i = 0; i < sortedSong.length; i++) {
            // if root
            if (sortedSong[i].note === rootNote) {
                sortedSong[i].weight -= 0.9;
            }
            // if absolute value of index between notes in less than 2, subtract weight
            else if (Math.abs(notes.indexOf(sortedSong[i].note) - notes.indexOf(rootNote)) < 2) {
                sortedSong[i].weight -= 0.3;
            }
            else {
                sortedSong[i].weight += 0.2;
            }
        }

        // clamp the weights
        for (let i = 0; i < sortedSong.length; i++) {
            if (sortedSong[i].weight < 0.0) {
                sortedSong[i].weight = 0.0;
            }
            else if (sortedSong[i].weight > 1.0) {
                sortedSong[i].weight = 1.0;
            }
        }
        
    }


    function randomSynth() {
        const note = keys[Math.floor(Math.random() * keys.length)];
        const octave = Math.floor(Math.random() * 4) - 1;
        let swingDelay = (currentBeat % 2 !== 0) ? (60.0 / bpm / division) * swingAmount : 0;
        playNote(note, nextNoteTime + swingDelay, octave);
    }


    function sequenceSynth(time) {
        if (synthMode === 'random') {
            randomSynth(time);
        }
        else if (synthMode === 'weighted') {
            weightedSynth(time);
        }
    }


    function resetActiveKeys() {
        document.querySelectorAll('.key, .black-key').forEach(button => {
            button.classList.remove('button-active');
        });
    }
    
    document.querySelectorAll('.key, .black-key').forEach(button => {
        button.addEventListener('click', function() {
            if (touchSynth) {
                resetActiveKeys()
                this.classList.add('button-active');
                const note = this.id;
                playNote(note, audioCtx.currentTime);
                return;
            }
            // if key in keys, remove it
            if (keys.includes(this.id)) {
                this.classList.remove('button-active');
                keys = keys.filter(key => key !== this.id);

                // if in song, remove it
                if (song[this.id]) {
                    delete song[this.id];
                }
                return;
            }
            this.classList.add('button-active');
            const note = this.id;
            keys.push(note);
        });
    });

    // touch synth checkbox
    document.getElementById('touch-synth').addEventListener('change', function() {
        touchSynth = this.checked;
        keys = [];
        resetActiveKeys();
        // set the transpose buttons to opacity 0.5 if touch synth is checked, else 1
        document.querySelectorAll('.transpose').forEach(button => {
            button.style.opacity = this.checked ? '0.5' : '1';
        });
        song = {};
    });


    // weighted synth checkbox
    document.getElementById('weighted-synth').addEventListener('change', function() {
        synthMode = this.checked ? 'random' : 'weighted';
    }
    );
    
    // waveform buttons
    document.querySelectorAll('.waveform').forEach(waveformButton => {
        // initially set all but the first button to 0.5 opacity
        if (waveformButton.id !== 'sine') {
            waveformButton.style.opacity = '0.5';
        }
        waveformButton.addEventListener('click', function() {
            waveform = this.id;
            // make all other buttons opacity 0.5
            document.querySelectorAll('.waveform').forEach(button => {
                button.style.opacity = '0.5';
            });
            this.style.opacity = '1';
        });
    });

     // transpose buttons
     document.querySelectorAll('.transpose').forEach(button => {
        button.addEventListener('click', function() {
            // if no selected keys, toggle all butons in c major
            if (touchSynth) return;
            if (keys.length === 0) {
                keys = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
                resetActiveKeys();
                keys.forEach(key => {
                    document.getElementById(key).classList.add('button-active');
                });
                document.querySelector('.transpose-key').textContent = 'C';

                return;
            }
            resetActiveKeys();
            // transpose the keys +1 or -1
            if (this.id === 'up') {
                keys = keys.map(key => {
                    const index = notes.indexOf(key);
                    return notes[(index + 1) % notes.length];
                });
            } else {
                keys = keys.map(key => {
                    const index = notes.indexOf(key);
                    return notes[(index - 1 + notes.length) % notes.length];
                });
            }
            keys.forEach(key => {
                document.getElementById(key).classList.add('button-active');
            });
            
            // set text to the new key
            document.querySelector('.transpose-key').textContent = keys[0].toUpperCase();
            song = {};
            
        });
    });




    // SAMPLER FUNCTIONS //

    // open the file input when the button is clicked
    document.querySelector('.sampler-newsample').addEventListener('click', function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = e => {
            const file = e.target.files[0];
            // if file is too large, alert the user (max size for large audio files is 10mb)
            if (file.size > 10000000) {
                alert('File is too large. Please use a file under 10mb.');
                return;
            }
            const reader = new FileReader();
            reader.onload = fileEvent => {
                const arrayBuffer = fileEvent.target.result;
                audioCtx.decodeAudioData(arrayBuffer, decodedData => {
                    samplerSample = decodedData;
                    // set the start and end of the sample
                    sampleStart = 0;
                    sampleEnd = 1;
                    document.getElementById('sample-start').value = 0;
                    document.getElementById('sample-end').value = 100;
                    
                    document.querySelector('.sampler-file-txt').textContent = file.name;
                    drawWaveform(decodedData);

                    document.getElementById('sample-pitch').value = 0;

                    // reset the active sources
                    activeSources.forEach(source => {
                        source.stop();
                    });

                    // reset the active pads
                    sequences.forEach(sequence => {
                        sequence.querySelectorAll('button').forEach(button => {
                            if (button.classList.contains('sample')) {
                                button.classList.remove('button-active');
                            }
                        });
                    });
                }, error => {
                    console.error("Error decoding audio data: ", error);
                });
            };
            reader.readAsArrayBuffer(file);
        };
        input.click();
    });

    // draw the waveform of the sample
    function drawWaveform(buffer) {
        const canvas = document.getElementById('sample-waveform');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const data = buffer.getChannelData(0);
        ctx.clearRect(0, 0, width, height);
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        for (let i = 0; i < data.length; i++) {
            ctx.lineTo(i / data.length * width, (data[i] + 1) * height / 2);
        }
        ctx.stroke();

        // add the bars for the start and end of the sample
        const start = document.getElementById('sample-start').value / 100;
        const end = document.getElementById('sample-end').value / 100;
        //green
        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.fillRect(start * width, 0, 2, height);
        // red
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(end * width, 0, 2, height);
    }

    // sample trigger (play from start)
    // save it so we can stop it later
    function samplerTrigger(time) {
        if (!samplerSample) return;

        
        const source = audioCtx.createBufferSource();
        // set the start and end of the sample
        source.buffer = samplerSample;
        source.loop = false;
        source.loopStart = sampleStart * source.buffer.duration;
        source.loopEnd = sampleEnd * source.buffer.duration;
        source.connect(samplerGain);

        const pitchShift = document.getElementById('sample-pitch').value;
        source.detune.value = pitchShift * 100;

        source.start(time, source.loopStart);
        source.stop(time + (source.loopEnd - source.loopStart));
        activeSources.push(source);
        source.onended = function() {
            activeSources = activeSources.filter(s => s !== source);
        };

        // stop other samples
        activeSources.forEach(source => {
            if (source !== activeSources[activeSources.length - 1]) {
                // stop the other samples
                source.stop(time);
            }
        });
    }


    // start should be left to end, end should be right to start
    document.getElementById('sample-start').addEventListener('input', function() {
        sampleStart = this.value / 100;
        drawWaveform(samplerSample);
    });

    document.getElementById('sample-end').addEventListener('input', function() {
        sampleEnd = this.value / 100;
        drawWaveform(samplerSample);
    });
    
    // set start and end initially to 0 and 100
    document.getElementById('sample-start').value = 0;
    document.getElementById('sample-end').value = 100;
    sampleStart = 0;
    sampleEnd = 1;


    // recrd microphone when rec is clicked, save as sampler sample
    // reset the sample completely
    // stop recording when rec is clicked again
    // will be played with the sampler trigger function
    document.querySelector('.sampler-record').addEventListener('click', function() {
        if (!isRecording) {
            // Start recording
            stopSequencer();
            isRecording = true;
            audioChunks = []; // Reset previous recordings
            // save previous color
            this.textContent = 'Stop'; // Update button text or use an indicator
            // set the background color to red
            this.style.backgroundColor = 'red';

            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.ondataavailable = event => {
                        audioChunks.push(event.data);
                    };
                    mediaRecorder.onstop = () => {
                        const audioBlob = new Blob(audioChunks, { 'type' : 'audio/ogg; codecs=opus' });
                        const audioUrl = URL.createObjectURL(audioBlob);
                        const audio = new Audio(audioUrl);
                        // Load the recording into the sampler
                        loadSampleIntoSampler(audioBlob);
                    };
                    mediaRecorder.start();
                })
                .catch(error => console.error("Error accessing the microphone: ", error));
        } else {
            // Stop recording
            isRecording = false;
            this.textContent = 'Rec'; // Reset button text or indicator
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Stop the media stream
            this.style.backgroundColor = 'green'; // Reset the background color
        }
    });

    // set to green initially
    document.querySelector('.sampler-record').style.backgroundColor = 'green';

    function loadSampleIntoSampler(blob) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const arrayBuffer = event.target.result;
            audioCtx.decodeAudioData(arrayBuffer, decodedData => {
                samplerSample = decodedData; // Set the new sample
                sampleStart = 0;
                sampleEnd = 1;
                document.getElementById('sample-start').value = 0;
                document.getElementById('sample-end').value = 100;
                drawWaveform(decodedData);

                document.querySelector('.sampler-file-txt').textContent = 'recording';

            }, error => {
                console.error("Error decoding audio data: ", error);
            });
        };
        reader.readAsArrayBuffer(blob);
    }


    // SOUNDS FUNCTIONS //

    function getFrequency(note, octave) {
        const notes = {
            c: 261.63,
            'c#': 277.18,
            d: 293.66,
            'd#': 311.13,
            e: 329.63,
            f: 349.23,
            'f#': 369.99,
            g: 392.00,
            'g#': 415.30,
            a: 440.00,
            'a#': 466.16,
            b: 493.88
        };
        // scale so octave 1 is c1, ocvate 2 is c2, octave -1 is c0, etc
        return notes[note] * Math.pow(2, octave - 1);
    }
    

    // play note with scheduling
    function playNote(note, time, octave = 1) {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(synthGain);
        oscillator.type = waveform;
        oscillator.frequency.setValueAtTime(getFrequency(note, octave), time);
        
        gainNode.gain.setValueAtTime(0.1, time);
        // Ramp down more smoothly to avoid clipping
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.95);
    
        oscillator.start(time);
        oscillator.stop(time + 1.05); // Stop the oscillator a little later
    }

    // play kick
    function playKick(time) {
        if (drumKit === 0) {
            kick1(time, audioCtx, drumGain);
        }
        else if (drumKit === 1) {
            kick2(time, audioCtx, drumGain);
        }
        else if (drumKit === 2) {
            kick3(time, audioCtx, drumGain);
        }
        else if (drumKit === 3) {
            kick4(time, audioCtx, drumGain);
        }
    }

    // play snare
    function playSnare(time) {
        if (drumKit === 0) {
            snare1(time, audioCtx, drumGain);
        }
        else if (drumKit === 1) {
            snare2(time, audioCtx, drumGain);
        }
        else if (drumKit === 2) {
            snare3(time, audioCtx, drumGain);
        }
        else if (drumKit === 3) {
            snare4(time, audioCtx, drumGain);
        }
    }

    // play hihat
    function playHiHat(time) {
        if (drumKit === 0) {
            hihat1(time, audioCtx, drumGain);
        }
        else if (drumKit === 1) {
            hihat2(time, audioCtx, drumGain);
        }
        else if (drumKit === 2) {
            hihat3(time, audioCtx, drumGain);
        }
        else if (drumKit === 3) {
            hihat4(time, audioCtx, drumGain);
        }
    }

    // play tom
    function playTom(time) {
        if (drumKit === 0) {
            tom1(time, audioCtx, drumGain);
        }
        else if (drumKit === 1) {
            tom2(time, audioCtx, drumGain);
        }
        else if (drumKit === 2) {
            tom3(time, audioCtx, drumGain);
        }
        else if (drumKit === 3) {
            tom4(time, audioCtx, drumGain);
        }
    }

    // play bell
    function playBell(time, frequency) {
        if (drumKit === 0) {
            bell1(time, frequency, audioCtx, drumGain);
        }
        else if (drumKit === 1) {
            bell2(time, frequency, audioCtx, drumGain);
        }
        else if (drumKit === 2) {
            bell3(time, frequency, audioCtx, drumGain);
        }
        else if (drumKit === 3) {
            bell4(time, frequency, audioCtx, drumGain);
        }
    }

    
    function playSample(buffer, time) {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(drumGain); 
        source.start(time);
    
        activeSources.push(source);
    
        source.onended = function() {
            activeSources = activeSources.filter(s => s !== source);
        };
    }

    function playNoteFromMIDI(note) {
        const noteIndex = note % 12;
        const octave = Math.floor(note / 12) - 1;
        const noteName = notes[noteIndex];
        playNote(noteName, audioCtx.currentTime, octave);
    }

    // midi listener
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
    } else {
        console.log("No MIDI support in your browser.");
    }

    function onMIDISuccess(midiAccess) {
        for (var input of midiAccess.inputs.values()) {
            input.onmidimessage = getMIDIMessage;
        }
    }

    function onMIDIFailure() {
        console.log("Could not access your MIDI devices.");
    }

    function getMIDIMessage(midiMessage) {
        const command = midiMessage.data[0];
        const note = midiMessage.data[1] - 24; // subtract 24 to get the correct octave (-2)
        const velocity = (midiMessage.data.length > 2) ? midiMessage.data[2] : 0;
        switch (command) {
            case 144: // note on
                if (velocity > 0) {
                    // if unfocused or audio context is suspended, disregard
                    if (document.hidden || audioCtx.state === 'suspended') {
                        return;
                    }
                    // if synth screen is active, play note
                    if (document.querySelector('.synth').style.display === 'block') {
                        playNoteFromMIDI(note);
                    }
                    else {
                        // c = kick, d = snare, e = hihat, f = tom
                        // disregard octave
                        const noteIndex = note % 12;
                        const noteName = notes[noteIndex];
                        if (noteName === 'c') {
                            //play kick or sample at kick
                            playSound('kick', audioCtx.currentTime);
                        }
                        else if (noteName === 'd') {
                            //play snare or sample at snare
                            playSound('snare', audioCtx.currentTime);
                        }
                        else if (noteName === 'e') {
                            //play hihat or sample at hihat
                            playSound('hihat', audioCtx.currentTime);
                        }
                        else if (noteName === 'f') {
                            //play tom or sample at tom
                            playSound('tom', audioCtx.currentTime);
                        }
                        else if (noteName === 'g') {
                            //play bell or sample at bell
                            playSound('bell', audioCtx.currentTime);
                        }
                    }
                }
                break;
            case 128: // note off
                break;
        }
    }
    
});
