// Purpose: Core code file related to Music Utils Tests.

using CompositionToolbox.App.Models;

namespace CompositionToolbox.Tests;

public class MusicUtilsTests
{
    [Fact]
    public void NormalOrder_RespectsRahnTieBreak()
    {
        var pcs = new[] { 0, 5, 6, 7 };
        var result = MusicUtils.ComputeNormalOrder(pcs, 12);
        // The algorithm chooses the most compact rotation and returns it in original pitch-class order.
        // For input {0,5,6,7} the chosen rotation is [5,6,7,0].
        Assert.Equal(new[] { 5, 6, 7, 0 }, result);
    }

    [Fact]
    public void NormalOrder_DeterministicForSymmetricSet()
    {
        var pcs = new[] { 0, 3, 6, 9 };
        var result = MusicUtils.ComputeNormalOrder(pcs, 12);
        Assert.Equal(new[] { 0, 3, 6, 9 }, result);
    }

    [Fact]
    public void PrimeForm_UsesPackedLeftComparison()
    {
        var pcs = new[] { 0, 5, 6, 7 };
        var result = MusicUtils.ComputePrimeForm(pcs, 12);
        // Under the current packed-left comparison implemented in ComputePrimeForm,
        // the algorithm selects [0,1,2,7] as the prime form for this input.
        Assert.Equal(new[] { 0, 1, 2, 7 }, result);
    }

    [Fact]
    public void NormalOrder_DebugCandidates()
    {
        var set = new[] { 0, 5, 6, 7 };
        int modulus = 12;
        int k = set.Length;

        // replicate rotation generation for i = 1
        int i = 1;
        var rotated = new int[k];
        for (int j = 0; j < k; j++)
        {
            var idx = (i + j) % k;
            var val = set[idx];
            if (idx < i) val += modulus;
            rotated[j] = val;
        }

        var candidate = new int[k];
        var t = rotated[0];
        for (int j = 0; j < k; j++) candidate[j] = ((rotated[j] - t) % modulus + modulus) % modulus;

        Assert.Equal(new[] { 0, 1, 2, 7 }, candidate);

        // Ensure ComputeNormalOrder returns the original rotation [5,6,7,0]
        var normal = MusicUtils.ComputeNormalOrder(set, modulus);
        Assert.Equal(new[] { 5, 6, 7, 0 }, normal);
    }

    [Fact]
    public void NormalAndPrimeForm_Example_3_11_2()
    {
        var pcs = new[] { 3, 11, 2 };
        var normal = MusicUtils.ComputeNormalOrder(pcs, 12);
        Assert.Equal(new[] { 11, 2, 3 }, normal);

        var prime = MusicUtils.ComputePrimeForm(pcs, 12);
        Assert.Equal(new[] { 0, 1, 4 }, prime);
        // uses Example 33.3.1 from https://musictheory.pugetsound.edu/mt21c/PrimeForm.html
    }

    [Fact]
    public void NormalOrder_LeftwardTieBreak_Example147810()
    {
        var pcs = new[] { 1, 4, 7, 8, 10 };
        var result = MusicUtils.ComputeNormalOrder(pcs, 12);
        // Should choose the rotation most compact toward the left: [7,8,10,1,4]
        Assert.Equal(new[] { 7, 8, 10, 1, 4 }, result);
    }
}
