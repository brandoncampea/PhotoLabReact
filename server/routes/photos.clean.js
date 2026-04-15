import express from 'express';
import multer from 'multer';
import path from 'path';
import mssql from '../mssql.cjs';
const { queryRow, queryRows, query } = mssql;
import csv from 'csv-parser';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { createWorker } from 'tesseract.js';
import { uploadImageBufferToAzure, deleteBlobByUrl, downloadBlob } from '../services/azureStorage.js';
import { requireActiveSubscription, enforceStorageQuotaForStudio } from '../middleware/subscription.js';
import orderReceiptService from '../services/orderReceiptService.js';

const router = express.Router();

// ...existing code...

export default router;
