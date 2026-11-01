"""Builds e2e/fixtures/reading: notebooks as other tools leave them, for the
rendering screenshots (#133). Needs nbformat, nbclient, ipykernel, pandas,
matplotlib and ipywidgets:

    python -m venv .venv && .venv/bin/pip install nbformat nbclient ipykernel \
        pandas matplotlib ipywidgets
    .venv/bin/python scripts/make-reading-fixtures.py

All content is written here (no third-party data). The outputs are what
the Python kernel produces; "Old format.ipynb" is written by hand.
"""

import json
import pathlib
import sys

import nbformat
from nbclient import NotebookClient
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook

OUT = pathlib.Path(__file__).resolve().parent.parent / "e2e" / "fixtures" / "reading"
KERNEL = sys.argv[1] if len(sys.argv) > 1 else "python3"

MOONS = """import pandas as pd
moons = pd.DataFrame(
    {
        "planet": ["Jupiter", "Jupiter", "Jupiter", "Jupiter", "Saturn", "Neptune"],
        "radius_km": [1821.6, 1560.8, 2634.1, 2410.3, 2574.7, 1353.4],
        "density_g_cm3": [3.528, 3.013, 1.942, 1.834, 1.882, 2.061],
        "orbit_days": [1.769, 3.551, 7.155, 16.689, 15.945, -5.877],
        "discovered": [1610, 1610, 1610, 1610, 1655, 1846],
    },
    index=pd.Index(["Io", "Europa", "Ganymede", "Callisto", "Titan", "Triton"], name="moon"),
)"""


def run(nb):
    NotebookClient(nb, kernel_name=KERNEL, timeout=120).execute()
    return nb


def save(nb, name):
    nb.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3", "language": "python"}
    nbformat.write(nb, OUT / name)


def data_frames():
    return run(new_notebook(cells=[
        new_markdown_cell("# Data frames\n\nTables as pandas renders them."),
        new_code_cell(MOONS + "\nmoons"),
        new_code_cell("moons.describe()"),
        new_code_cell(
            "wide = pd.DataFrame({f'column {i}': [i * j for j in range(4)] for i in range(24)})\nwide"
        ),
        new_code_cell("moons.groupby('planet').agg(['mean', 'max'])"),
        new_code_cell("print(moons.to_string())"),
    ]))


def plots():
    return run(new_notebook(cells=[
        new_markdown_cell("# Plots\n\nMatplotlib figures as PNG and as SVG."),
        new_code_cell(
            "%matplotlib inline\nimport matplotlib.pyplot as plt\nimport math\n"
            "xs = [i / 10 for i in range(100)]\n"
            "fig, ax = plt.subplots(figsize=(6, 3), dpi=80)\n"
            "for moon, period in [('Io', 1.769), ('Europa', 3.551), ('Ganymede', 7.155)]:\n"
            "    ax.plot(xs, [math.sin(2 * math.pi * x / period) for x in xs], label=moon)\n"
            "ax.set_xlabel('days'); ax.set_ylabel('phase'); ax.legend(); plt.show()"
        ),
        new_code_cell(
            "from matplotlib_inline.backend_inline import set_matplotlib_formats\n"
            "set_matplotlib_formats('svg')\n"
            "fig, ax = plt.subplots(figsize=(5, 3))\n"
            "ax.bar(['Io', 'Europa', 'Ganymede', 'Callisto'], [1821.6, 1560.8, 2634.1, 2410.3])\n"
            "ax.set_title('Radius (km)'); plt.show()"
        ),
        new_code_cell(
            "set_matplotlib_formats('png')\n"
            "fig, ax = plt.subplots(figsize=(12, 2), dpi=80)\n"
            "ax.plot(xs, [x * x for x in xs]); ax.set_title('A wide figure'); plt.show()"
        ),
    ]))


def run_errors(nb):
    NotebookClient(nb, kernel_name=KERNEL, timeout=120, allow_errors=True).execute()
    return nb


def math_and_markdown():
    return run(new_notebook(cells=[
        new_markdown_cell(
            "# Math and Markdown\n\n"
            "Kepler's third law: $T^2 = \\frac{4\\pi^2}{G M} a^3$.\n\n"
            "$$\\frac{d^2 \\mathbf{r}}{dt^2} = -\\frac{G M}{r^3} \\mathbf{r}$$\n\n"
            "| Moon | Radius (km) | Resonance |\n|:--|--:|:-:|\n"
            "| Io | 1821.6 | 4 |\n| Europa | 1560.8 | 2 |\n| Ganymede | 2634.1 | 1 |\n\n"
            "> The Laplace resonance: Io orbits four times while Ganymede orbits once.\n\n"
            "- [x] Io\n- [x] Europa\n- [ ] Callisto\n\n"
            "```python\nresonance = {'Io': 4, 'Europa': 2, 'Ganymede': 1}\n```\n\n"
            "An image from the notebook's attachments:\n\n![Orbits](attachment:orbits.png)"
        ),
        new_code_cell("from IPython.display import Math, Markdown\nMath(r'\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}')"),
        new_code_cell("Markdown('Rendered from **code**: `Ganymede` is the *largest* moon.')"),
    ]))


def orbits_png():
    """A small picture of three orbits, base64 PNG, as a pasted image is stored."""
    import base64
    import io

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(3, 1.5), dpi=80)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(plt.Circle((0, 0), 0.25, color="#d9a441"))
    for r in (0.6, 0.9, 1.2):
        ax.add_patch(plt.Circle((0, 0), r, fill=False, color="#888"))
    ax.set_xlim(-2.6, 2.6)
    ax.set_ylim(-1.3, 1.3)
    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()


def widgets():
    return run(new_notebook(cells=[
        new_markdown_cell("# Widgets\n\nSaved with their state; shown here without a kernel."),
        new_code_cell(
            "import ipywidgets as w\n"
            "w.IntSlider(value=4, min=1, max=8, description='Resonance')"
        ),
        new_code_cell(
            "w.VBox([w.Text(value='Ganymede', description='Moon'),"
            " w.Checkbox(value=True, description='Has magnetosphere'),"
            " w.Dropdown(options=['Jupiter', 'Saturn'], value='Jupiter', description='Planet')])"
        ),
    ]))


OLD_FORMAT = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
        "kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
        "language_info": {"name": "python", "version": "3.4.3"},
    },
    "cells": [
        {"cell_type": "markdown", "metadata": {}, "source": ["# Old format\n", "\n", "nbformat 4.0: no cell ids."]},
        {
            "cell_type": "code",
            "execution_count": 1,
            "metadata": {"collapsed": False},
            "source": ["print('Hello from 2015')\n", "6 * 7"],
            "outputs": [
                {"output_type": "stream", "name": "stdout", "text": ["Hello from 2015\n"]},
                {"output_type": "execute_result", "execution_count": 1, "metadata": {}, "data": {"text/plain": ["42"]}},
            ],
        },
        {
            "cell_type": "code",
            "execution_count": 2,
            "metadata": {"collapsed": True},
            "source": ["# a collapsed cell"],
            "outputs": [],
        },
    ],
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    save(data_frames(), "Data frames.ipynb")
    save(plots(), "Plots.ipynb")
    save(run_errors(new_notebook(cells=[
        new_markdown_cell("# Errors and long output"),
        new_code_cell("for i in range(300):\n    print(f'step {i:3d}: orbit {i * 7.155:9.3f} days')"),
        new_code_cell(
            "import sys, warnings\nprint('to stderr', file=sys.stderr)\n"
            "warnings.warn('Io is volcanically active')"
        ),
        new_code_cell(
            "def period(moon):\n    return {'Io': 1.769}[moon]\n\n"
            "def periods(moons):\n    return [period(m) for m in moons]\n\n"
            "periods(['Io', 'Europa'])"
        ),
    ])), "Errors and long output.ipynb")
    nb = math_and_markdown()
    nb.cells[0].attachments = {"orbits.png": {"image/png": orbits_png()}}
    save(nb, "Math and Markdown.ipynb")
    save(widgets(), "Widgets.ipynb")
    (OUT / "Old format.ipynb").write_text(json.dumps(OLD_FORMAT, indent=1) + "\n")


if __name__ == "__main__":
    main()
