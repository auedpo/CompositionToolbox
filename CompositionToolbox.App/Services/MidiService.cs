using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NAudio.Midi;
using CompositionToolbox.App.Models;
using System.Diagnostics;

namespace CompositionToolbox.App.Services
{
    public class MidiService : IDisposable
    {
        private MidiOut? _out;
        private int _deviceIndex = -1;

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
            _out?.Dispose();
            _out = null;
            _deviceIndex = -1;
            try
            {
                if (index >= 0 && index < MidiOut.NumberOfDevices)
                {
                    _out = new MidiOut(index);
                    _deviceIndex = index;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("Failed to open MIDI device: " + ex.Message);
            }
        }

        public async Task PlaySelectedNode(Models.PitchNode node)
        {
            if (_out == null) return;
            var baseMidi = 60;
            var pcs = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered;
            await PlaySequence(pcs, baseMidi, 90, 250);
        }

        public async Task PlayMidiSequence(int[] midiNotes, int velocity = 90, int stepMs = 250)
        {
            if (_out == null) return;
            if (midiNotes == null || midiNotes.Length == 0) return;
            foreach (var note in midiNotes)
            {
                _out.Send(MidiMessage.StartNote(note, velocity, 1).RawData);
                await Task.Delay(stepMs);
                _out.Send(MidiMessage.StopNote(note, 0, 1).RawData);
            }
        }

        public async Task PlayMidiChord(int[] midiNotes, int velocity = 90, int durationMs = 450)
        {
            if (_out == null) return;
            if (midiNotes == null || midiNotes.Length == 0) return;
            var unique = midiNotes.Distinct().ToArray();
            foreach (var note in unique)
            {
                _out.Send(MidiMessage.StartNote(note, velocity, 1).RawData);
            }
            await Task.Delay(durationMs);
            foreach (var note in unique)
            {
                _out.Send(MidiMessage.StopNote(note, 0, 1).RawData);
            }
        }

        public async Task PlaySequence(int[] pcs, int baseMidi = 60, int velocity = 90, int stepMs = 250)
        {
            if (_out == null) return;
            if (pcs == null || pcs.Length == 0) return;
            foreach (var pc in pcs)
            {
                var note = baseMidi + pc;
                _out.Send(MidiMessage.StartNote(note, velocity, 1).RawData);
                await Task.Delay(stepMs);
                _out.Send(MidiMessage.StopNote(note, 0, 1).RawData);
            }
        }

        public async Task PlayChord(int[] pcs, int baseMidi = 60, int velocity = 90, int durationMs = 450)
        {
            if (_out == null) return;
            if (pcs == null || pcs.Length == 0) return;
            var unique = pcs.Distinct().ToArray();
            foreach (var pc in unique)
            {
                var note = baseMidi + pc;
                _out.Send(MidiMessage.StartNote(note, velocity, 1).RawData);
            }
            await Task.Delay(durationMs);
            foreach (var pc in unique)
            {
                var note = baseMidi + pc;
                _out.Send(MidiMessage.StopNote(note, 0, 1).RawData);
            }
        }

        public void Dispose()
        {
            _out?.Dispose();
            _out = null;
        }
    }
}
