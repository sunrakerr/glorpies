# Braille display subset

`braille.woff2` contains only U+2800–U+28FF from Noto Sans Symbols 2, used by the headline's decorative transition. It is 2,216 bytes instead of loading the complete symbols font. The font is licensed under the accompanying [SIL Open Font License](OFL.txt).

Source: [Google Fonts · Noto Sans Symbols 2](https://github.com/google/fonts/tree/main/ofl/notosanssymbols2). The layout uses `next/font/local`; builds do not need Python or fonttools.

To reproduce the subset from a downloaded upstream font:

```sh
python -m pip install 'fonttools[woff]'
pyftsubset NotoSansSymbols2-Regular.ttf --unicodes=U+2800-28FF --flavor=woff2 --output-file=braille.woff2
```
