using System;

namespace CompositionToolbox.App.Models
{
    public sealed class MidiMonitorMessage
    {
        public MidiMonitorMessage(DateTime timestamp, string eventType, int channel, int? note, int? pitchBend)
        {
            Timestamp = timestamp;
            EventType = eventType;
            Channel = channel;
            Note = note;
            PitchBend = pitchBend;
        }

        public DateTime Timestamp { get; }
        public string EventType { get; }
        public int Channel { get; }
        public int? Note { get; }
        public int? PitchBend { get; }
    }
}
