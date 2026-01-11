// Purpose: Domain model that represents the Domain Models data used across the application.

using System;
using System.Collections.Generic;
using System.ComponentModel;

namespace CompositionToolbox.App.Models
{
    public enum PcMode { Ordered, Unordered }
    public enum AtomicValueType
    {
        PitchList,
        RhythmPattern,
        VoicingList,
        RegisterPattern,
        NoteEventSeq
    }

    public class OpDescriptor
    {
        public string OpKey { get; set; } = string.Empty;
        public string OpType { get; set; } = string.Empty;
        public string OperationLabel { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Summary { get; set; } = string.Empty;
        public string[]? Tags { get; set; }
        public string SourceLens { get; set; } = string.Empty;
        public Dictionary<string, object>? OpParams { get; set; }
        public Guid? SourceNodeId { get; set; }

        public string ToDisplayString()
        {
            var label = !string.IsNullOrWhiteSpace(Title)
                ? Title
                : OperationLabel;

            if (string.IsNullOrWhiteSpace(label))
            {
                return SourceLens;
            }
            if (string.IsNullOrWhiteSpace(SourceLens))
            {
                return label;
            }
            return $"{SourceLens} -> {label}";
        }
    }

    public class AtomicNode : INotifyPropertyChanged
    {
        private string _label = string.Empty;

        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid NodeId
        {
            get => Id;
            set => Id = value;
        }
        public AtomicValueType ValueType { get; set; } = AtomicValueType.PitchList;
        public string? ValueJson { get; set; }
        public int Modulus { get; set; }
        public PcMode Mode { get; set; }
        public int[] Ordered { get; set; } = Array.Empty<int>();
        public int[] Unordered { get; set; } = Array.Empty<int>();
        public string Label
        {
            get => _label;
            set
            {
                if (string.Equals(_label, value, StringComparison.Ordinal)) return;
                _label = value;
                OnPropertyChanged(nameof(Label));
            }
        }
        public OpDescriptor? OpFromPrev { get; set; }

        public event PropertyChangedEventHandler? PropertyChanged;

        public override string ToString()
        {
            var badge = Mode == PcMode.Unordered ? "[U]" : "[O]";
            var body = Mode == PcMode.Unordered ? $"[{string.Join(' ', Unordered)}]" : $"({string.Join(' ', Ordered)})";
            var label = string.IsNullOrWhiteSpace(Label) ? "-" : Label;
            var showLabel = !string.IsNullOrWhiteSpace(Label)
                && !string.Equals(Label, "Input", StringComparison.OrdinalIgnoreCase);
            var op = OpFromPrev?.ToDisplayString();
            if (!string.IsNullOrWhiteSpace(op))
            {
                label = showLabel ? $"{label} ({op})" : $"({op})";
            }
            return $"{badge} {label} {body}";
        }

        private void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}
