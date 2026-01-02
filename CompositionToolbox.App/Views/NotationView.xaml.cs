using CompositionToolbox.App.Models;
using Microsoft.Web.WebView2.Core;
using System.Text.Json;
using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Controls;

namespace CompositionToolbox.App.Views
{
    public partial class NotationView : System.Windows.Controls.UserControl
    {
        private AtomicNode? _pendingNode;
        private AccidentalRule _pendingAccidentalRule;
        private string _pendingRenderMode = "line";
        private double? _pendingWidth;
        private double? _pendingHeight;
        private double? _pendingContentWidth;
        private int? _pendingMaxNotes;
        private bool _pendingClipToViewport;
        private bool _pendingShowOverflowIndicator;
        private bool _pendingAllowScroll;
        private int[]? _pendingMidiNotes;
        private bool _pendingUseMidiForEdo19;
        private bool _hasPending;
        private bool _isInitialized;

        public NotationView()
        {
            InitializeComponent();
            Loaded += NotationView_Loaded;
        }

        private async void NotationView_Loaded(object? sender, System.Windows.RoutedEventArgs e)
        {
            var htmlPath = Path.Combine(AppContext.BaseDirectory, "Assets", "notation.html");
            if (File.Exists(htmlPath))
            {
                await WebView.EnsureCoreWebView2Async();
                WebView.CoreWebView2.SetVirtualHostNameToFolderMapping("appassets", Path.Combine(AppContext.BaseDirectory, "Assets"), CoreWebView2HostResourceAccessKind.Allow);
                WebView.NavigationCompleted += (_, _) => RenderPendingIfAny();
                WebView.Source = new Uri("https://appassets/notation.html");
                _isInitialized = true;
            }
        }

        public async void RenderNode(
            AtomicNode? node,
            AccidentalRule accidentalRule,
            string renderMode = "line",
            double? width = null,
            double? height = null,
            int? maxNotes = null,
            bool clipToViewport = false,
            bool showOverflowIndicator = false,
            double? contentWidth = null,
            bool allowScroll = false,
            int[]? midiNotes = null,
            bool useMidiForEdo19 = false)
        {
            if (node == null) return;
            if (WebView.CoreWebView2 == null || !_isInitialized)
            {
                _pendingNode = node;
                _pendingAccidentalRule = accidentalRule;
                _pendingRenderMode = renderMode;
                _pendingWidth = width;
                _pendingHeight = height;
                _pendingContentWidth = contentWidth;
                _pendingMaxNotes = maxNotes;
                _pendingClipToViewport = clipToViewport;
                _pendingShowOverflowIndicator = showOverflowIndicator;
                _pendingAllowScroll = allowScroll;
                _pendingMidiNotes = midiNotes;
                _pendingUseMidiForEdo19 = useMidiForEdo19;
                _hasPending = true;
                return;
            }
            var payload = new
            {
                mode = node.Mode == PcMode.Ordered ? "ordered" : "unordered",
                modulus = node.Modulus,
                pcs = node.Mode == PcMode.Ordered ? node.Ordered : node.Unordered,
                midi = midiNotes,
                label = node.Label,
                accidentalRule = accidentalRule.ToString(),
                renderMode,
                width,
                height,
                maxNotes,
                clip = clipToViewport,
                showOverflow = showOverflowIndicator,
                contentWidth,
                allowScroll,
                useMidiForEdo19
            };
            var json = JsonSerializer.Serialize(payload);
            try
            {
                await WebView.CoreWebView2.ExecuteScriptAsync($"window.renderPcs({json})");
            }
            catch (Exception) { }
        }

        private void RenderPendingIfAny()
        {
            if (!_hasPending || _pendingNode == null) return;
            var node = _pendingNode;
            var rule = _pendingAccidentalRule;
            var mode = _pendingRenderMode;
            var width = _pendingWidth;
            var height = _pendingHeight;
            var maxNotes = _pendingMaxNotes;
            var clip = _pendingClipToViewport;
            var showOverflow = _pendingShowOverflowIndicator;
            var contentWidth = _pendingContentWidth;
            var allowScroll = _pendingAllowScroll;
            var midiNotes = _pendingMidiNotes;
            var useMidiForEdo19 = _pendingUseMidiForEdo19;
            _hasPending = false;
            RenderNode(node, rule, mode, width, height, maxNotes, clip, showOverflow, contentWidth, allowScroll, midiNotes, useMidiForEdo19);
        }
    }
}
