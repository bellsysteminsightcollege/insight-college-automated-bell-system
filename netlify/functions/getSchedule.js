// ===============================================================
// Automated School Bell System
// Copyright (c) 2026 Aaqib's DevDesk. All Rights Reserved.
// Developer: Aaqib Anwar @ Aaqib's DevDesk

// Project: Automated School Bell System
// Developed for: Institutional Bell Schedule Automation
// Developer Contact: aaqib.devdesk@gmail.com , anwarcareem@gmail.com

// ---------------------------------------------------------------
// INTELLECTUAL PROPERTY NOTICE
// ---------------------------------------------------------------

// This software, including its source code, architecture, design,
// documentation, and associated systems, is the intellectual
// property of Aaqib Anwar @ Aaqib's DevDesk.

// This project was independently designed and developed by
// Aaqib Anwar @ Aaqib's DevDesk and is protected under applicable copyright laws
// and international intellectual property regulations.

// ---------------------------------------------------------------
// RESTRICTIONS
// ---------------------------------------------------------------

// The following actions are STRICTLY PROHIBITED without explicit
// written permission from the developer:

// • Copying or reproducing this software
// • Modifying the source code
// • Redistributing the code
// • Reverse engineering or extracting logic
// • Using the system for commercial or institutional deployment
// • Reusing any part of the codebase in other projects

// Unauthorized use, duplication, or distribution of this software
// or any portion of it may result in legal action.

// ---------------------------------------------------------------
// PERMITTED USE
// ---------------------------------------------------------------

// The deployed system may only be used for operational purposes
// within the institution for which it was developed.

// The source code remains the property of the developer.

// ---------------------------------------------------------------
// DISCLAIMER
// ---------------------------------------------------------------

// This software is provided "as is" without warranties of any kind.
// The developer shall not be held liable for damages arising from
// misuse, modification, or unauthorized deployment.

// ---------------------------------------------------------------
// END OF NOTICE
// ---------------------------------------------------------------

const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGODB_URI;
let mongoClient = null;

async function connectMongoDB() {
  if (!mongoClient) {
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
  }
  return mongoClient.db('bell_system');
}

exports.handler = async function(event, context) {
  console.log('📋 Get schedule function invoked');
  
  try {
    const db = await connectMongoDB();
    const collection = db.collection('schedules');
    
    // Get all schedules, sorted by most recent
    const schedules = await collection.find({})
      .sort({ updatedAt: -1 })
      .limit(10) // Limit to 10 most recent schedules
      .toArray();
    
    if (schedules.length === 0) {
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify({
          schedule: { periods: [] },
          count: 0,
          message: 'No schedules found'
        })
      };
    }
    
    // Combine all periods from all schedules
    const allPeriods = [];
    schedules.forEach(schedule => {
      if (schedule.periods && Array.isArray(schedule.periods)) {
        schedule.periods.forEach(period => {
          // Add schedule ID to track delivery
          period.scheduleId = schedule._id.toString();
          allPeriods.push(period);
        });
      }
    });
    
    // FIXED: Remove duplicates based on day, startTime, AND duration
    // This allows same time on different days
    const uniquePeriods = [];
    const seenPeriods = new Set();
    
    allPeriods.forEach(period => {
      // Create unique key including day, startTime, and duration
      const key = `${period.day || 'unknown'}-${period.startTime}-${period.duration}`;
      
      if (!seenPeriods.has(key)) {
        seenPeriods.add(key);
        uniquePeriods.push(period);
        console.log(`✅ Keeping period: ${period.day} ${period.startTime} - ${period.name || 'unnamed'}`);
      } else {
        console.log(`⚠️ Removing duplicate: ${period.day} ${period.startTime} - ${period.name || 'unnamed'}`);
      }
    });
    
    // Optional: Sort periods by day and time
    uniquePeriods.sort((a, b) => {
      // Define day order
      const dayOrder = {
        'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
        'Friday': 5, 'Saturday': 6, 'Sunday': 7, 'Exam Day': 8
      };
      
      const dayCompare = (dayOrder[a.day] || 9) - (dayOrder[b.day] || 9);
      if (dayCompare !== 0) return dayCompare;
      
      // Same day, sort by time
      return a.startTime.localeCompare(b.startTime);
    });
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify({
        schedule: { periods: uniquePeriods },
        count: uniquePeriods.length,
        timestamp: new Date().toISOString(),
        totalSchedules: schedules.length,
        debug: {
          totalPeriodsBeforeDedup: allPeriods.length,
          totalPeriodsAfterDedup: uniquePeriods.length
        }
      })
    };
    
  } catch (error) {
    console.error('Error getting schedules:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Failed to get schedules',
        message: error.message 
      })
    };
  }
};
