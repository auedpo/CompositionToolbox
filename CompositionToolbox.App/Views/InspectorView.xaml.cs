// Purpose: Code-behind for the Inspector View view that wires inputs into its view model.

using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Views
{
    public partial class InspectorView : System.Windows.Controls.UserControl
    {
        private InspectorViewModel? _vm;
        private InspectorNotationWindow? _notationWindow;

        public InspectorView()
        {
            InitializeComponent();
            DataContextChanged += InspectorView_DataContextChanged;
            SizeChanged += InspectorView_SizeChanged;
        }

        private void InspectorView_DataContextChanged(object sender, System.Windows.DependencyPropertyChangedEventArgs e)
        {
            if (_vm != null)
            {
                _vm.PropertyChanged -= Vm_PropertyChanged;
            }

            _vm = DataContext as InspectorViewModel;
            if (_vm != null)
            {
                _vm.PropertyChanged += Vm_PropertyChanged;
            }

            RenderNotation();
        }

        private void Vm_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(InspectorViewModel.NotationNode)
                || e.PropertyName == nameof(InspectorViewModel.NotationRenderMode)
                || e.PropertyName == nameof(InspectorViewModel.AccidentalRule)
                || e.PropertyName == nameof(InspectorViewModel.NotationMidiNotes)
                || e.PropertyName == nameof(InspectorViewModel.NotationExtras))
            {
                RenderNotation();
                UpdateExpandedNotation();
            }
        }

        private void InspectorView_SizeChanged(object sender, System.Windows.SizeChangedEventArgs e)
        {
            RenderNotation();
        }

        private void RenderNotation()
        {
            if (_vm == null) return;
            var width = Math.Max(0, InspectorNotation.ActualWidth - 16);
            var height = Math.Max(0, InspectorNotation.ActualHeight - 16);
            if (width <= 0 || height <= 0) return;
            InspectorNotation.RenderNode(
                _vm.NotationNode,
                _vm.AccidentalRule,
                _vm.NotationRenderMode,
                width: width,
                height: height,
                maxNotes: 16,
                clipToViewport: true,
                showOverflowIndicator: true,
                midiNotes: _vm.NotationMidiNotes,
                useMidiForEdo19: _vm.UseSessionOverride,
                notationExtras: _vm.NotationExtras);
        }

        private void UpdateExpandedNotation()
        {
            if (_notationWindow == null || !_notationWindow.IsVisible || _vm?.NotationNode == null) return;
                _notationWindow.SetNotation(_vm.NotationNode, _vm.AccidentalRule, _vm.NotationRenderMode, _vm.NotationMidiNotes, _vm.UseSessionOverride, _vm.NotationExtras);
        }

        private void ExpandNotation_Click(object sender, System.Windows.RoutedEventArgs e)
        {
            if (_vm?.NotationNode == null) return;
            if (_notationWindow == null || !_notationWindow.IsVisible)
            {
                _notationWindow = new InspectorNotationWindow
                {
                    Owner = System.Windows.Window.GetWindow(this)
                };
                _notationWindow.Closed += (_, _) => _notationWindow = null;
            }
            _notationWindow.SetNotation(_vm.NotationNode, _vm.AccidentalRule, _vm.NotationRenderMode, _vm.NotationMidiNotes, _vm.UseSessionOverride, _vm.NotationExtras);
            _notationWindow.Show();
            _notationWindow.Activate();
        }

        private void LabelDisplay_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount == 2 && _vm != null)
            {
                _vm.EditLabelCommand.Execute(null);
            }
        }

        private void LabelEdit_LostKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            if (_vm == null) return;
            _vm.CommitLabelEdit();
            _vm.IsEditingLabel = false;
        }

        private void LabelEdit_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (_vm == null) return;
            if (e.Key == Key.Enter)
            {
                _vm.CommitLabelEdit();
                _vm.IsEditingLabel = false;
                e.Handled = true;
            }
            else if (e.Key == Key.Escape)
            {
                _vm.LabelEdit = _vm.SelectedNode?.Label ?? string.Empty;
                _vm.IsEditingLabel = false;
                e.Handled = true;
            }
        }

        private void LabelEdit_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
        {
            if (sender is System.Windows.Controls.TextBox box && box.IsVisible)
            {
                box.Focus();
                box.SelectAll();
            }
        }
    }
}
