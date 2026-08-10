// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textParagraphs(value, { fontSize, bold = false, color }) {
  const lines = String(value).replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line) => {
    if (!line) return "<a:p><a:endParaRPr lang=\"en-US\"/></a:p>";
    return `<a:p><a:r><a:rPr lang="en-US" sz="${fontSize}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t xml:space="preserve">${escapeXml(line)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`;
  }).join("");
}

function textBox({ id, name, x, y, width, height, text, fontSize, bold = false, color }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="73152" tIns="36576" rIns="73152" bIns="36576" anchor="t"/><a:lstStyle/>${textParagraphs(text, { fontSize, bold, color })}</p:txBody></p:sp>`;
}

function slideXml(text, index) {
  const body = text || "No selectable text found on this page.";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F8F7F3"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${textBox({ id: 2, name: "Page heading", x: 502920, y: 320040, width: 11064240, height: 384048, text: `Page ${index + 1}`, fontSize: 1800, bold: true, color: "5543D7" })}${textBox({ id: 3, name: "Extracted page text", x: 502920, y: 914400, width: 11064240, height: 5394960, text: body, fontSize: 1300, color: "26262B" })}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function contentTypesXml(slideCount) {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides}</Types>`;
}

function presentationXml(slideCount) {
  const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`;
}

function presentationRelationshipsXml(slideCount) {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}</Relationships>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const SLIDE_MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Local File Studio"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="5543D7" accent2="2F7D65" accent3="C86B42" accent4="8B7CF6" accent5="D49A2A" accent6="507E9C" bg1="F8F7F3" bg2="E5E0D5" folHlink="954F72" hlink="0563C1" tx1="26262B" tx2="59575F"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;

const SLIDE_MASTER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;

const SLIDE_LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const SLIDE_LAYOUT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;

const SLIDE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Local File Studio"><a:themeElements><a:clrScheme name="Local File Studio"><a:dk1><a:srgbClr val="26262B"/></a:dk1><a:lt1><a:srgbClr val="F8F7F3"/></a:lt1><a:dk2><a:srgbClr val="59575F"/></a:dk2><a:lt2><a:srgbClr val="E5E0D5"/></a:lt2><a:accent1><a:srgbClr val="5543D7"/></a:accent1><a:accent2><a:srgbClr val="2F7D65"/></a:accent2><a:accent3><a:srgbClr val="C86B42"/></a:accent3><a:accent4><a:srgbClr val="8B7CF6"/></a:accent4><a:accent5><a:srgbClr val="D49A2A"/></a:accent5><a:accent6><a:srgbClr val="507E9C"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Local File Studio"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:solidFill><a:schemeClr val="lt2"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

function appPropertiesXml(slideCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Local File Studio</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips><ScaleCrop>false</ScaleCrop><Company>TeamBlackBox Private Limited</Company><AppVersion>1.0</AppVersion></Properties>`;
}

const CORE_PROPERTIES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PDF text reconstruction</dc:title><dc:creator>Local File Studio</dc:creator><cp:lastModifiedBy>Local File Studio</cp:lastModifiedBy></cp:coreProperties>`;

export async function createTextPresentation(pages) {
  if (!Array.isArray(pages) || pages.length === 0) throw new TypeError("A presentation requires at least one page.");

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const add = (path, value) => zip.file(path, value, { date: ZIP_DATE });
  add("[Content_Types].xml", contentTypesXml(pages.length));
  add("_rels/.rels", ROOT_RELS);
  add("docProps/app.xml", appPropertiesXml(pages.length));
  add("docProps/core.xml", CORE_PROPERTIES);
  add("ppt/presentation.xml", presentationXml(pages.length));
  add("ppt/_rels/presentation.xml.rels", presentationRelationshipsXml(pages.length));
  add("ppt/slideMasters/slideMaster1.xml", SLIDE_MASTER);
  add("ppt/slideMasters/_rels/slideMaster1.xml.rels", SLIDE_MASTER_RELS);
  add("ppt/slideLayouts/slideLayout1.xml", SLIDE_LAYOUT);
  add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", SLIDE_LAYOUT_RELS);
  add("ppt/theme/theme1.xml", THEME);
  pages.forEach((text, index) => {
    add(`ppt/slides/slide${index + 1}.xml`, slideXml(text, index));
    add(`ppt/slides/_rels/slide${index + 1}.xml.rels`, SLIDE_RELS);
  });

  const bytes = await zip.generateAsync({
    type: "uint8array",
    mimeType: PPTX_MIME,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return new Blob([bytes], { type: PPTX_MIME });
}
