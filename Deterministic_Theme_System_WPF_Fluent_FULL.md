# Deterministic Theme System (WPF + Fluent)
**Audience:** Codex (implementation)  
**Goal:** Eliminate theme/system color surprises by defining a single app-owned semantic palette and binding all content UI to it.

---

## 0. Non-negotiable principles

1. The app owns all colors used in **content UI**.
2. OS / Fluent theme is an *input* that selects a palette, never a source of colors.
3. Controls bind only to `Brush.*` semantic resources.
4. Only two palettes in v1: **LightNeutral** and **DarkNeutral**.
5. No component-specific colors. No derived ad-hoc colors.

---

## 1. Semantic role set (the contract)

Define **exactly these 15 roles**.  
No additions in v1.

### Surfaces
- `App.Background`
- `Surface.Background`
- `Surface.Border`
- `Canvas.Background`
- `Canvas.GridLine`

### Text
- `Text.Primary`
- `Text.Secondary`
- `Text.Disabled`

### Interaction
- `Accent`
- `Selection.Fill`
- `Selection.Outline`
- `Focus.Ring`

### State
- `Danger`
- `Warning`
- `Success`

---

## 2. ResourceDictionary structure

```
Themes/
├─ AppTheme.Keys.xaml
├─ AppTheme.Brushes.xaml
├─ AppTheme.Palette.LightNeutral.xaml
└─ AppTheme.Palette.DarkNeutral.xaml
```

---

## 3. AppTheme.Keys.xaml (stable contract)

Defines the semantic brush keys.  
This file must never change after initial creation.

```xml
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">

    <!-- Surfaces -->
    <SolidColorBrush x:Key="Brush.App.Background" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Surface.Background" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Surface.Border" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Canvas.Background" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Canvas.GridLine" Color="#000000"/>

    <!-- Text -->
    <SolidColorBrush x:Key="Brush.Text.Primary" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Text.Secondary" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Text.Disabled" Color="#000000"/>

    <!-- Interaction -->
    <SolidColorBrush x:Key="Brush.Accent" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Selection.Fill" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Selection.Outline" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Focus.Ring" Color="#000000"/>

    <!-- State -->
    <SolidColorBrush x:Key="Brush.Danger" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Warning" Color="#000000"/>
    <SolidColorBrush x:Key="Brush.Success" Color="#000000"/>

</ResourceDictionary>
```

---

## 4. AppTheme.Palette.LightNeutral.xaml

```xml
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">

    <!-- Surfaces -->
    <Color x:Key="Color.App.Background">#F5F5F5</Color>
    <Color x:Key="Color.Surface.Background">#FFFFFF</Color>
    <Color x:Key="Color.Surface.Border">#D1D1D1</Color>
    <Color x:Key="Color.Canvas.Background">#FAFAFA</Color>
    <Color x:Key="Color.Canvas.GridLine">#1A000000</Color>

    <!-- Text -->
    <Color x:Key="Color.Text.Primary">#111111</Color>
    <Color x:Key="Color.Text.Secondary">#4A4A4A</Color>
    <Color x:Key="Color.Text.Disabled">#8A8A8A</Color>

    <!-- Interaction -->
    <Color x:Key="Color.Accent">#2B6DE8</Color>
    <Color x:Key="Color.Selection.Fill">#1A2B6DE8</Color>
    <Color x:Key="Color.Selection.Outline">#2B6DE8</Color>
    <Color x:Key="Color.Focus.Ring">#802B6DE8</Color>

    <!-- State -->
    <Color x:Key="Color.Danger">#D13438</Color>
    <Color x:Key="Color.Warning">#F5A623</Color>
    <Color x:Key="Color.Success">#107C10</Color>

</ResourceDictionary>
```

---

## 5. AppTheme.Palette.DarkNeutral.xaml

```xml
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">

    <!-- Surfaces -->
    <Color x:Key="Color.App.Background">#0F0F10</Color>
    <Color x:Key="Color.Surface.Background">#16181A</Color>
    <Color x:Key="Color.Surface.Border">#2A2D2F</Color>
    <Color x:Key="Color.Canvas.Background">#101214</Color>
    <Color x:Key="Color.Canvas.GridLine">#26FFFFFF</Color>

    <!-- Text -->
    <Color x:Key="Color.Text.Primary">#F2F2F2</Color>
    <Color x:Key="Color.Text.Secondary">#B9B9B9</Color>
    <Color x:Key="Color.Text.Disabled">#6F6F6F</Color>

    <!-- Interaction -->
    <Color x:Key="Color.Accent">#4F8DFF</Color>
    <Color x:Key="Color.Selection.Fill">#264F8DFF</Color>
    <Color x:Key="Color.Selection.Outline">#4F8DFF</Color>
    <Color x:Key="Color.Focus.Ring">#994F8DFF</Color>

    <!-- State -->
    <Color x:Key="Color.Danger">#FF5A5F</Color>
    <Color x:Key="Color.Warning">#FFCC00</Color>
    <Color x:Key="Color.Success">#3CCB7F</Color>

</ResourceDictionary>
```

---

## 6. AppTheme.Brushes.xaml (Color → Brush bridge)

```xml
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">

    <!-- Surfaces -->
    <SolidColorBrush x:Key="Brush.App.Background" Color="{DynamicResource Color.App.Background}"/>
    <SolidColorBrush x:Key="Brush.Surface.Background" Color="{DynamicResource Color.Surface.Background}"/>
    <SolidColorBrush x:Key="Brush.Surface.Border" Color="{DynamicResource Color.Surface.Border}"/>
    <SolidColorBrush x:Key="Brush.Canvas.Background" Color="{DynamicResource Color.Canvas.Background}"/>
    <SolidColorBrush x:Key="Brush.Canvas.GridLine" Color="{DynamicResource Color.Canvas.GridLine}"/>

    <!-- Text -->
    <SolidColorBrush x:Key="Brush.Text.Primary" Color="{DynamicResource Color.Text.Primary}"/>
    <SolidColorBrush x:Key="Brush.Text.Secondary" Color="{DynamicResource Color.Text.Secondary}"/>
    <SolidColorBrush x:Key="Brush.Text.Disabled" Color="{DynamicResource Color.Text.Disabled}"/>

    <!-- Interaction -->
    <SolidColorBrush x:Key="Brush.Accent" Color="{DynamicResource Color.Accent}"/>
    <SolidColorBrush x:Key="Brush.Selection.Fill" Color="{DynamicResource Color.Selection.Fill}"/>
    <SolidColorBrush x:Key="Brush.Selection.Outline" Color="{DynamicResource Color.Selection.Outline}"/>
    <SolidColorBrush x:Key="Brush.Focus.Ring" Color="{DynamicResource Color.Focus.Ring}"/>

    <!-- State -->
    <SolidColorBrush x:Key="Brush.Danger" Color="{DynamicResource Color.Danger}"/>
    <SolidColorBrush x:Key="Brush.Warning" Color="{DynamicResource Color.Warning}"/>
    <SolidColorBrush x:Key="Brush.Success" Color="{DynamicResource Color.Success}"/>

</ResourceDictionary>
```

---

## 7. App.xaml wiring

```xml
<Application.Resources>
  <ResourceDictionary>
    <ResourceDictionary.MergedDictionaries>

      <!-- Fluent theme dictionaries (chrome only) -->

      <ResourceDictionary Source="Themes/AppTheme.Keys.xaml"/>
      <ResourceDictionary Source="Themes/AppTheme.Brushes.xaml"/>

      <!-- Default palette -->
      <ResourceDictionary Source="Themes/AppTheme.Palette.DarkNeutral.xaml"/>

    </ResourceDictionary.MergedDictionaries>
  </ResourceDictionary>
</Application.Resources>
```

---

## 8. Runtime palette switching (pseudocode)

```csharp
enum AppThemeKind { LightNeutral, DarkNeutral }

static class AppTheme
{
    static void Apply(AppThemeKind kind)
    {
        var dicts = Application.Current.Resources.MergedDictionaries;

        remove any dict where Source contains "AppTheme.Palette.";

        var uri = (kind == LightNeutral)
            ? "Themes/AppTheme.Palette.LightNeutral.xaml"
            : "Themes/AppTheme.Palette.DarkNeutral.xaml";

        dicts.Add(new ResourceDictionary { Source = uri });
    }
}
```

---

## 9. Binding rules (enforced)

- Content UI binds **only** to `Brush.*`
- No `System*` brushes
- No `Fluent*` brushes
- No direct `Color` bindings in owned controls

---

## 10. Explicit non-goals (v1)

- No OS accent inheritance
- No per-control color roles
- No dynamic color math
- No high-contrast variants

These can be added later without breaking the contract.

---

## 11. Mental model

- Keys define meaning
- Palettes define values
- Brushes are the only binding surface
- Fluent = chrome, not authority
