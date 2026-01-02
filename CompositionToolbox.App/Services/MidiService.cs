using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using NAudio.Midi;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public class MidiService : IDisposable
    {
        private const int DefaultChannel = 1;
        private const int MpeFirstChannel = 2;
        private const int MpeLastChannel = 16;
        private const int PitchBendCenter = 8192;
        private const int PitchBendMax = 16383;
        private const int DefaultPitchBendRangeSemitones = 48;
        private MidiOut? _out;
        private int _deviceIndex = -1;
        private int _pitchBendRangeSemitones = DefaultPitchBendRangeSemitones;

        public bool IsOpen => _out != null;
        public int ActiveDeviceIndex => _deviceIndex;
        public string? LastError { get; private set; }
        public event EventHandler<MidiMonitorMessage>? MidiMessageSent;

        public IEnumerable<(int index, string name)> GetDevices()
        {
            var count = MidiOut.NumberOfDevices;
            for (int i = 0; i < count; i++)
            {
                var info = MidiOut.DeviceInfo(i);
                yield return (i, info.ProductName);
            }
        }

        public void OpenDevice(int index)
        {
            if (_deviceIndex == index) return;
            CloseDevice();
            LastError = null;

            try
            {
                if (index < 0 || index >= MidiOut.NumberOfDevices)
                {
                    LastError = $"Invalid MIDI device index {index}.";
                    return;
                }

                _out = new MidiOut(index);
                _deviceIndex = index;
                InitializeMpePitchBendRange();
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                Debug.WriteLine("Failed to open MIDI device: " + ex);
            }
        }

        public async Task PlaySelectedNode(AtomicNode node)
        {
            if (!IsOpen) return;
            var baseMidi = 60;
            var pcs = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
            await PlaySequence(pcs, baseMidi, 90, 250);
        }

        public async Task PlayMidiSequence(int[] midiNotes, int velocity = 90, int stepMs = 250)
        {
            if (!IsOpen) return;
            if (midiNotes == null || midiNotes.Length == 0) return;

            foreach (var note in midiNotes)
            {
                SendNoteOn(note, velocity);
                await Task.Delay(stepMs);
                SendNoteOff(note);
            }
        }

        public async Task PlayMidiChord(int[] midiNotes, int velocity = 90, int durationMs = 450)
        {
            if (!IsOpen) return;
            if (midiNotes == null || midiNotes.Length == 0) return;

            var unique = midiNotes.Distinct().ToArray();
            foreach (var note in unique)
            {
                SendNoteOn(note, velocity);
            }
            await Task.Delay(durationMs);
            foreach (var note in unique)
            {
                SendNoteOff(note);
            }
        }

        public async Task PlaySequence(int[] pcs, int baseMidi = 60, int velocity = 90, int stepMs = 250)
        {
            if (!IsOpen) return;
            if (pcs == null || pcs.Length == 0) return;

            foreach (var pc in pcs)
            {
                var note = baseMidi + pc;
                SendNoteOn(note, velocity);
                await Task.Delay(stepMs);
                SendNoteOff(note);
            }
        }

        public async Task PlayChord(int[] pcs, int baseMidi = 60, int velocity = 90, int durationMs = 450)
        {
            if (!IsOpen) return;
            if (pcs == null || pcs.Length == 0) return;

            var unique = pcs.Distinct().ToArray();
            foreach (var pc in unique)
            {
                var note = baseMidi + pc;
                SendNoteOn(note, velocity);
            }
            await Task.Delay(durationMs);
            foreach (var pc in unique)
            {
                var note = baseMidi + pc;
                SendNoteOff(note);
            }
        }

        public async Task PlayPcs(int[] pcs, int modulus, PcMode mode, RealizationConfig config, int velocity = 90, int stepMs = 250, int durationMs = 450)
        {
            if (!IsOpen) return;
            if (pcs == null || pcs.Length == 0) return;
            if (modulus <= 0) return;

            if (modulus == 12)
            {
                var midi = MusicUtils.RealizePcs(pcs, modulus, mode, config);
                if (mode == PcMode.Unordered)
                {
                    await PlayMidiChord(midi, velocity, durationMs);
                }
                else
                {
                    await PlayMidiSequence(midi, velocity, stepMs);
                }
                return;
            }

            if (mode == PcMode.Unordered)
            {
                await PlayMicrotonalChord(pcs, modulus, config, velocity, durationMs);
            }
            else
            {
                await PlayMicrotonalSequence(pcs, modulus, config, velocity, stepMs);
            }
        }

        public async Task TestOutput()
        {
            if (!IsOpen) return;
            _out!.Send(MidiMessage.ChangePatch(0, DefaultChannel).RawData);
            _out.Send(MidiMessage.ChangeControl(7, 100, DefaultChannel).RawData);
            SendNoteOn(60, 110);
            await Task.Delay(400);
            SendNoteOff(60);
        }

        public async Task TestMicrotoneSweep(int modulus, int baseMidi = 60, int velocity = 90, int durationMs = 800, int steps = 40)
        {
            if (!IsOpen) return;
            if (modulus <= 1) return;
            if (steps < 4) steps = 4;
            if (durationMs < 100) durationMs = 100;

            var channel = MpeFirstChannel;
            SendPitchBendRange(channel, _pitchBendRangeSemitones);
            SendPitchBend(channel, PitchBendCenter);
            SendNoteOn(baseMidi, velocity, channel);

            var targetSemitones = 12.0 / modulus;
            var stepDelay = durationMs / steps;
            for (int i = 0; i <= steps; i++)
            {
                var ratio = i / (double)steps;
                var semitoneOffset = targetSemitones * ratio;
                var bend = PitchBendCenter + (int)Math.Round((semitoneOffset / _pitchBendRangeSemitones) * PitchBendCenter, MidpointRounding.AwayFromZero);
                bend = Math.Clamp(bend, 0, PitchBendMax);
                SendPitchBend(channel, bend);
                await Task.Delay(stepDelay);
            }

            SendNoteOff(baseMidi, channel);
            SendPitchBend(channel, PitchBendCenter);
        }

        private async Task PlayMicrotonalSequence(int[] pcs, int modulus, RealizationConfig config, int velocity, int stepMs)
        {
            if (!IsOpen) return;
            var steps = RealizeEdoSteps(pcs, modulus, PcMode.Ordered, config);
            if (steps.Length == 0) return;

            var baseMidi = config?.Pc0RefMidi ?? 60;
            var channel = MpeFirstChannel;
            SendPitchBendRange(channel, _pitchBendRangeSemitones);
            foreach (var step in steps)
            {
                var (note, bend) = ConvertStepToMidi(step, modulus, baseMidi, _pitchBendRangeSemitones);
                SendPitchBend(channel, bend);
                SendNoteOn(note, velocity, channel);
                await Task.Delay(stepMs);
                SendNoteOff(note, channel);
                SendPitchBend(channel, PitchBendCenter);
            }
        }

        private async Task PlayMicrotonalChord(int[] pcs, int modulus, RealizationConfig config, int velocity, int durationMs)
        {
            if (!IsOpen) return;
            var steps = RealizeEdoSteps(pcs, modulus, PcMode.Unordered, config);
            if (steps.Length == 0) return;

            var baseMidi = config?.Pc0RefMidi ?? 60;
            var uniqueSteps = steps.Distinct().ToArray();
            var channels = new int[uniqueSteps.Length];
            for (int i = 0; i < uniqueSteps.Length; i++)
            {
                channels[i] = GetMpeChannel(i);
                SendPitchBendRange(channels[i], _pitchBendRangeSemitones);
            }

            for (int i = 0; i < uniqueSteps.Length; i++)
            {
                var (note, bend) = ConvertStepToMidi(uniqueSteps[i], modulus, baseMidi, _pitchBendRangeSemitones);
                SendPitchBend(channels[i], bend);
                SendNoteOn(note, velocity, channels[i]);
            }

            await Task.Delay(durationMs);

            for (int i = 0; i < uniqueSteps.Length; i++)
            {
                var (note, _) = ConvertStepToMidi(uniqueSteps[i], modulus, baseMidi, _pitchBendRangeSemitones);
                SendNoteOff(note, channels[i]);
                SendPitchBend(channels[i], PitchBendCenter);
            }
        }

        private static int[] RealizeEdoSteps(int[] pcs, int modulus, PcMode mode, RealizationConfig config)
        {
            var local = (config ?? new RealizationConfig()).Clone();
            local.Pc0RefMidi = 0;
            local.AmbitusLowMidi = null;
            local.AmbitusHighMidi = null;
            if (local.ChordVoicingMode == ChordVoicingMode.Centered)
            {
                local.ChordVoicingMode = ChordVoicingMode.Closed;
            }
            return MusicUtils.RealizePcs(pcs, modulus, mode, local);
        }

        private static (int note, int bend) ConvertStepToMidi(int step, int modulus, int baseMidi, int bendRangeSemitones)
        {
            var targetMidi = baseMidi + (step * 12.0 / modulus);
            var baseNote = (int)Math.Round(targetMidi, MidpointRounding.AwayFromZero);
            baseNote = Math.Clamp(baseNote, 0, 127);
            var delta = targetMidi - baseNote;
            var normalized = delta / bendRangeSemitones;
            var bend = PitchBendCenter + (int)Math.Round(normalized * PitchBendCenter, MidpointRounding.AwayFromZero);
            bend = Math.Clamp(bend, 0, PitchBendMax);
            return (baseNote, bend);
        }

        private void SendNoteOn(int midiNote, int velocity, int channel = DefaultChannel)
        {
            _out!.Send(MidiMessage.StartNote(midiNote, velocity, channel).RawData);
            MidiMessageSent?.Invoke(this, new MidiMonitorMessage(DateTime.Now, "NoteOn", channel, midiNote, null));
        }

        private void SendNoteOff(int midiNote, int channel = DefaultChannel)
        {
            _out!.Send(MidiMessage.StopNote(midiNote, 0, channel).RawData);
            MidiMessageSent?.Invoke(this, new MidiMonitorMessage(DateTime.Now, "NoteOff", channel, midiNote, null));
        }

        private void SendPitchBend(int channel, int value)
        {
            var bendEvent = new PitchWheelChangeEvent(0, channel, value);
            _out!.Send(bendEvent.GetAsShortMessage());
            MidiMessageSent?.Invoke(this, new MidiMonitorMessage(DateTime.Now, "PitchBend", channel, null, value));
        }

        private void SendPitchBendRange(int channel, int semitones)
        {
            var msb = Math.Clamp(semitones, 0, 127);
            _out!.Send(MidiMessage.ChangeControl(101, 0, channel).RawData);
            _out.Send(MidiMessage.ChangeControl(100, 0, channel).RawData);
            _out.Send(MidiMessage.ChangeControl(6, msb, channel).RawData);
            _out.Send(MidiMessage.ChangeControl(38, 0, channel).RawData);
            _out.Send(MidiMessage.ChangeControl(101, 127, channel).RawData);
            _out.Send(MidiMessage.ChangeControl(100, 127, channel).RawData);
        }

        private void InitializeMpePitchBendRange()
        {
            if (!IsOpen) return;
            for (int channel = DefaultChannel; channel <= MpeLastChannel; channel++)
            {
                SendPitchBendRange(channel, _pitchBendRangeSemitones);
            }
        }

        public void SetPitchBendRangeSemitones(int semitones)
        {
            var clamped = Math.Clamp(semitones, 1, 96);
            _pitchBendRangeSemitones = clamped;
            InitializeMpePitchBendRange();
        }

        private static int GetMpeChannel(int index)
        {
            var count = MpeLastChannel - MpeFirstChannel + 1;
            return MpeFirstChannel + (index % count);
        }

        private void CloseDevice()
        {
            _out?.Dispose();
            _out = null;
            _deviceIndex = -1;
        }

        public void Dispose()
        {
            CloseDevice();
        }
    }
}
