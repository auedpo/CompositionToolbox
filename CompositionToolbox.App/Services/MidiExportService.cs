// Purpose: Service orchestrating midi export operations for the app.

using System;
using System.Collections.Generic;
using System.Linq;
using NAudio.Midi;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public sealed class MidiExportService : IMidiExportService
    {
        private const int TicksPerQuarter = 480;
        private const int TempoBpm = 120;
        private const int VelocityDefault = 90;
        private const int PitchBendCenter = 8192;
        private const int PitchBendMax = 16383;
        private const int MpeFirstChannel = 2;
        private const int MpeLastChannel = 16;
        private const int MpeMasterChannel = 1;

        private readonly INoteRealizer _noteRealizer;
        private readonly DragOutFileService _fileService;

        public MidiExportService(INoteRealizer noteRealizer, DragOutFileService fileService)
        {
            _noteRealizer = noteRealizer ?? throw new ArgumentNullException(nameof(noteRealizer));
            _fileService = fileService ?? throw new ArgumentNullException(nameof(fileService));
        }

        public string ExportToTempMidi(CompositeSnapshot snap, MidiExportOptions opts)
        {
            if (snap == null) throw new ArgumentNullException(nameof(snap));
            if (opts == null) throw new ArgumentNullException(nameof(opts));

            var path = _fileService.CreateTempPath(snap.DisplayName, snap.CompositeId);
            var collection = new MidiEventCollection(0, TicksPerQuarter);
            var trackIndex = 0;

            var tempoEvent = new TempoEvent(60000000 / TempoBpm, 0);
            var timeSigEvent = new TimeSignatureEvent(0, 4, 2, 24, 8);
            var trackNameEvent = new TextEvent(snap.DisplayName, MetaEventType.SequenceTrackName, 0);
            collection.AddEvent(trackNameEvent, trackIndex);
            collection.AddEvent(tempoEvent, trackIndex);
            collection.AddEvent(timeSigEvent, trackIndex);

            if (opts.RenderMode == MidiRenderMode.Chord)
            {
                if (!opts.UseMpeChannels)
                {
                    throw new InvalidOperationException("Chord mode requires per-note MPE channels.");
                }
                ExportChord(snap.WithMode(PcMode.Unordered), opts, collection, trackIndex);
            }
            else
            {
                var modeSnapshot = snap.Mode == PcMode.Ordered
                    ? snap.WithMode(PcMode.Ordered)
                    : snap.WithMode(PcMode.Unordered);
                ExportSequence(modeSnapshot, opts, collection, trackIndex);
            }

            collection.PrepareForExport();
            MidiFile.Export(path, collection);
            return path;
        }

        private void ExportChord(CompositeSnapshot snap, MidiExportOptions opts, MidiEventCollection collection, int trackIndex)
        {
            var realized = _noteRealizer.Realize(snap);
            if (realized.Count == 0) return;

            var ordered = realized
                .Select(n => new { Note = n, Key = $"{n.MidiNote}:{Math.Round(n.BendSemitones, 6)}" })
                .GroupBy(x => x.Key)
                .Select(g => g.First().Note)
                .OrderBy(n => n.MidiNote + n.BendSemitones)
                .ToList();

            if (ordered.Count > (MpeLastChannel - MpeFirstChannel + 1))
            {
                throw new InvalidOperationException("Chord mode supports up to 15 notes (channels 2-16).");
            }

            var channels = new List<int>(ordered.Count);
            for (int i = 0; i < ordered.Count; i++)
            {
                channels.Add(MpeFirstChannel + i);
            }

            AddPitchBendRangeRpn(collection, trackIndex, MpeMasterChannel, opts.PitchBendRangeSemitones);
            foreach (var channel in channels)
            {
                AddPitchBendRangeRpn(collection, trackIndex, channel, opts.PitchBendRangeSemitones);
            }

            const int startTick = 0;
            var endTick = 4 * TicksPerQuarter;
            for (int i = 0; i < ordered.Count; i++)
            {
                var note = ordered[i];
                var channel = channels[i];
                var velocity = note.Velocity ?? VelocityDefault;
                AddPitchBend(collection, trackIndex, channel, startTick, note.BendSemitones, opts.PitchBendRangeSemitones);
                collection.AddEvent(new NoteOnEvent(startTick, channel, note.MidiNote, velocity, 0), trackIndex);
                collection.AddEvent(new NoteEvent(endTick, channel, MidiCommandCode.NoteOff, note.MidiNote, 0), trackIndex);
                collection.AddEvent(new PitchWheelChangeEvent(endTick, channel, PitchBendCenter), trackIndex);
            }
        }

        private void ExportSequence(CompositeSnapshot snap, MidiExportOptions opts, MidiEventCollection collection, int trackIndex)
        {
            var realized = _noteRealizer.Realize(snap);
            if (realized.Count == 0) return;

            List<RealizedNote> ordered;
            if (snap.Mode == PcMode.Ordered && snap.Ordered.Length > 0)
            {
                ordered = realized.ToList();
            }
            else
            {
                ordered = realized
                    .Select(n => new { Note = n, Key = $"{n.MidiNote}:{Math.Round(n.BendSemitones, 6)}" })
                    .GroupBy(x => x.Key)
                    .Select(g => g.First().Note)
                    .OrderBy(n => n.MidiNote + n.BendSemitones)
                    .ToList();
            }

            var stepTicks = TicksPerQuarter / 2;
            var gateTicks = (int)Math.Round(stepTicks * 0.9, MidpointRounding.AwayFromZero);
            var channel = MpeFirstChannel;

            AddPitchBendRangeRpn(collection, trackIndex, MpeMasterChannel, opts.PitchBendRangeSemitones);
            AddPitchBendRangeRpn(collection, trackIndex, channel, opts.PitchBendRangeSemitones);

            for (int i = 0; i < ordered.Count; i++)
            {
                var note = ordered[i];
                var startTick = i * stepTicks;
                var endTick = startTick + gateTicks;
                var velocity = note.Velocity ?? VelocityDefault;
                AddPitchBend(collection, trackIndex, channel, startTick, note.BendSemitones, opts.PitchBendRangeSemitones);
                collection.AddEvent(new NoteOnEvent(startTick, channel, note.MidiNote, velocity, 0), trackIndex);
                collection.AddEvent(new NoteEvent(endTick, channel, MidiCommandCode.NoteOff, note.MidiNote, 0), trackIndex);
                collection.AddEvent(new PitchWheelChangeEvent(endTick, channel, PitchBendCenter), trackIndex);
            }
        }

        private static void AddPitchBendRangeRpn(MidiEventCollection collection, int trackIndex, int channel, double rangeSemitones)
        {
            var msb = Math.Clamp((int)Math.Round(rangeSemitones, MidpointRounding.AwayFromZero), 0, 127);
            collection.AddEvent(new ControlChangeEvent(0, channel, (MidiController)101, 0), trackIndex);
            collection.AddEvent(new ControlChangeEvent(0, channel, (MidiController)100, 0), trackIndex);
            collection.AddEvent(new ControlChangeEvent(0, channel, (MidiController)6, msb), trackIndex);
            collection.AddEvent(new ControlChangeEvent(0, channel, (MidiController)38, 0), trackIndex);
            collection.AddEvent(new ControlChangeEvent(0, channel, (MidiController)101, 127), trackIndex);
            collection.AddEvent(new ControlChangeEvent(0, channel, (MidiController)100, 127), trackIndex);
        }

        private static void AddPitchBend(MidiEventCollection collection, int trackIndex, int channel, int tick, double bendSemitones, double rangeSemitones)
        {
            var safeRange = Math.Abs(rangeSemitones) < 0.0001 ? 1.0 : rangeSemitones;
            var ratio = bendSemitones / safeRange;
            ratio = Math.Clamp(ratio, -1.0, 1.0);
            var bend = PitchBendCenter + (int)Math.Round(ratio * PitchBendCenter, MidpointRounding.AwayFromZero);
            bend = Math.Clamp(bend, 0, PitchBendMax);
            collection.AddEvent(new PitchWheelChangeEvent(tick, channel, bend), trackIndex);
        }
    }
}
