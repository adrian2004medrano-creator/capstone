const path = require('path');
const { analyzeText } = require('./textModel');

const MAX_TEXT_LENGTH = 200000;
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

const extractText = async (buffer, extension) => {
  if (extension === '.pdf') {
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('The file is not a valid PDF.');
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      return (await parser.getText()).text || '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (extension === '.docx') {
    if (buffer.subarray(0, 2).toString('latin1') !== 'PK') throw new Error('The file is not a valid DOCX document.');
    return (await require('mammoth').extractRawText({ buffer })).value || '';
  }
  if (extension === '.txt') return buffer.toString('utf8');
  throw new Error('Unsupported document type.');
};

const readDocument = async (buffer, originalName, textModel) => {
  const extension = path.extname(originalName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(extension)) throw new Error('Upload a PDF, DOCX, or TXT file.');

  let text = '';
  try {
    text = (await extractText(buffer, extension)).trim();
  } catch (error) {
    return { status: 'unreadable', analysis: null, note: error.message };
  }
  if (text.length < 20) {
    return { status: 'unreadable', analysis: null, note: 'No readable text found. Scanned images are not supported.' };
  }
  return { status: 'analyzed', analysis: analyzeText(textModel, text.slice(0, MAX_TEXT_LENGTH)), note: null };
};

// Combines per-document analyses into one client-level view (highest severity per category).
const aggregateAnalyses = (analyses) => {
  const merged = new Map();
  analyses.filter(Boolean).forEach((analysis) => {
    analysis.categories.forEach((category) => {
      if (!merged.has(category.key)) merged.set(category.key, category);
    });
  });
  const categories = [...merged.values()];
  return { categories, record_flags: Math.min(10, categories.reduce((sum, category) => sum + category.severity, 0)) };
};

module.exports = { SUPPORTED_EXTENSIONS, readDocument, aggregateAnalyses };
