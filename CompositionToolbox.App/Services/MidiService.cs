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
        private MidiOut? _out;
        private int _deviceIndex = -1;

        public bool IsOpen => _out != null;
        public int ActiveDeviceIndex => _deviceIndex;
        public string? LastError { get; private set; }

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

        public async Task TestOutput()
        {
            if (!IsOpen) return;
            _out!.Send(MidiMessage.ChangePatch(0, DefaultChannel).RawData);
            _out.Send(MidiMessage.ChangeControl(7, 100, DefaultChannel).RawData);
            SendNoteOn(60, 110);
            await Task.Delay(400);
            SendNoteOff(60);
        }

        private void SendNoteOn(int midiNote, int velocity)
        {
            _out!.Send(MidiMessage.StartNote(midiNote, velocity, DefaultChannel).RawData);
        }

        private void SendNoteOff(int midiNote)
        {
            _out!.Send(MidiMessage.StopNote(midiNote, 0, DefaultChannel).RawData);
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
