// Purpose: Utility helpers concerning shortcut guard for the UI.

using System.Windows;
using System.Windows.Media;
using WpfTextBoxBase = System.Windows.Controls.Primitives.TextBoxBase;
using WpfComboBox = System.Windows.Controls.ComboBox;
using WpfPasswordBox = System.Windows.Controls.PasswordBox;

namespace CompositionToolbox.App.Utilities
{
    public static class ShortcutGuard
    {
        public static bool IsCaretAvailable(DependencyObject? focusedElement)
        {
            if (focusedElement == null) return false;

            if (focusedElement is WpfTextBoxBase || focusedElement is WpfPasswordBox)
            {
                return true;
            }

            if (focusedElement is WpfComboBox combo && combo.IsEditable)
            {
                return true;
            }

            if (FindAncestor<WpfTextBoxBase>(focusedElement) != null) return true;
            if (FindAncestor<WpfPasswordBox>(focusedElement) != null) return true;

            var comboAncestor = FindAncestor<WpfComboBox>(focusedElement);
            if (comboAncestor?.IsEditable == true) return true;

            return false;
        }

        private static T? FindAncestor<T>(DependencyObject source) where T : DependencyObject
        {
            var current = source;
            while (current != null)
            {
                if (current is T match) return match;
                current = VisualTreeHelper.GetParent(current);
            }
            return null;
        }
    }
}
