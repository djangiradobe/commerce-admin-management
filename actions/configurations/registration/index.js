/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

async function main () {
    const extensionId = 'CommerceAdminManagement'

    return {
        statusCode: 200,
        body: {
            registration: {
                menuItems: [
                    {
                        id: `${extensionId}::apps`,
                        title: 'Apps',
                        isSection: true,
                        sortOrder: 1
                    },
                    {
                        id: `${extensionId}::configuration_management`,
                        title: 'Configuration Management',
                        parent: `${extensionId}::apps`,
                        sortOrder: 10
                    }
                ],
                page: {
                    title: 'Configuration Management - Adobe Commerce → Third-party APIs'
                }
            }
        }
    }
}

exports.main = main
