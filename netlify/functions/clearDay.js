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

exports.handler = async function (event, context) {
    // Check authentication
    if (!context.clientContext || !context.clientContext.user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Unauthorized' })
        };
    }

    const userId = context.clientContext.user.email;
    let data;

    try {
        data = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid JSON' })
        };
    }

    const { day } = data;
    if (!day) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Day is required' })
        };
    }

    try {
        const db = await connectMongoDB();
        const collection = db.collection('schedules');

        // Get user's schedules
        const userSchedules = await collection.find({ userId: userId }).toArray();

        // Remove periods for the specified day
        let updated = false;
        for (const schedule of userSchedules) {
            const originalCount = schedule.periods.length;
            const updatedPeriods = schedule.periods.filter(p => p.day !== day);

            if (updatedPeriods.length < originalCount) {
                await collection.updateOne(
                    { _id: schedule._id },
                    { $set: { periods: updatedPeriods, updatedAt: new Date() } }
                );
                updated = true;
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                updated: updated,
                message: `Cleared periods for ${day}`
            })
        };

    } catch (error) {
        console.error('Error clearing day:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
