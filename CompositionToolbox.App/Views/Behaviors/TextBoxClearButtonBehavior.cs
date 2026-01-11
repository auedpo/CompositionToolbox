// Purpose: Attached behavior providing reusable Text Box Clear Button Behavior helpers for XAML controls.

using System;
using System.Windows;
using System.Windows.Media;

namespace CompositionToolbox.App.Views.Behaviors
{
    public static class TextBoxClearButtonBehavior
    {
        private static bool _initialized;
        private const double ClearButtonSize = 16.0;
        private const double ClearButtonFontSize = 4.0;

        public static void EnsureInitialized()
        {
            if (_initialized)
            {
                return;
            }

            _initialized = true;
            EventManager.RegisterClassHandler(typeof(System.Windows.Controls.TextBox), FrameworkElement.LoadedEvent, new RoutedEventHandler(OnTextBoxLoaded));
        }

        private static void OnTextBoxLoaded(object sender, RoutedEventArgs e)
        {
            if (sender is not System.Windows.Controls.TextBox textBox)
            {
                return;
            }

            textBox.ApplyTemplate();
            var button = FindClearButton(textBox);
            if (button == null)
            {
                return;
            }

            button.Width = ClearButtonSize;
            button.Height = ClearButtonSize;
            button.MinWidth = ClearButtonSize;
            button.MinHeight = ClearButtonSize;
            button.Padding = new Thickness(0);
            button.Margin = new Thickness(0, 0, 0, 0);
            button.HorizontalAlignment = System.Windows.HorizontalAlignment.Center;
            button.VerticalAlignment = System.Windows.VerticalAlignment.Center;
            button.HorizontalContentAlignment = System.Windows.HorizontalAlignment.Center;
            button.VerticalContentAlignment = System.Windows.VerticalAlignment.Center;
            button.FontSize = Math.Min(button.FontSize, ClearButtonFontSize);
        }

        private static System.Windows.Controls.Primitives.ButtonBase? FindClearButton(System.Windows.Controls.TextBox textBox)
        {
            var template = textBox.Template;
            if (template != null)
            {
                var found = template.FindName("ClearButton", textBox) as System.Windows.Controls.Primitives.ButtonBase
                            ?? template.FindName("DeleteButton", textBox) as System.Windows.Controls.Primitives.ButtonBase
                            ?? template.FindName("PART_ClearButton", textBox) as System.Windows.Controls.Primitives.ButtonBase;
                if (found != null)
                {
                    return found;
                }
            }

            return FindClearButtonInVisualTree(textBox);
        }

        private static System.Windows.Controls.Primitives.ButtonBase? FindClearButtonInVisualTree(DependencyObject root)
        {
            var count = VisualTreeHelper.GetChildrenCount(root);
            for (var i = 0; i < count; i++)
            {
                var child = VisualTreeHelper.GetChild(root, i);
                if (child is System.Windows.Controls.Primitives.ButtonBase button)
                {
                    if (child is FrameworkElement fe)
                    {
                        var name = fe.Name ?? string.Empty;
                        if (name.Contains("Clear", StringComparison.OrdinalIgnoreCase)
                            || name.Contains("Delete", StringComparison.OrdinalIgnoreCase))
                        {
                            return button;
                        }
                    }
                }

                var nested = FindClearButtonInVisualTree(child);
                if (nested != null)
                {
                    return nested;
                }
            }

            return null;
        }
    }
}
