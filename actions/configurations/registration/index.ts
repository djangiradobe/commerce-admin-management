/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

async function main (params: any = {}) {
    const extensionId = 'CommerceAdminManagement'

    // Titles are configurable per project via .env (passed as action inputs):
    //   APP_TITLE       — the Commerce admin menu label (defaults below)
    //   APP_SECTION_TITLE — the parent section label (defaults to 'Apps')
    //   APP_PAGE_TITLE  — the in-app page/tab title (defaults to APP_TITLE)
    // Treat empty OR an unsubstituted "$VAR" (when the .env key is absent) as unset.
    const clean = (v, fallback) => {
        const s = v == null ? '' : String(v).trim()
        return (!s || s.startsWith('$')) ? fallback : s
    }
    const title = clean(params.APP_TITLE, 'Configuration Management')
    const sectionTitle = clean(params.APP_SECTION_TITLE, 'Apps')
    const pageTitle = clean(params.APP_PAGE_TITLE, title)

    return {
        statusCode: 200,
        body: {
            registration: {
                menuItems: [
                    {
                        id: `${extensionId}::apps`,
                        title: sectionTitle,
                        isSection: true,
                        sortOrder: 1
                    },
                    {
                        id: `${extensionId}::configuration_management`,
                        title,
                        parent: `${extensionId}::apps`,
                        sortOrder: 10
                    }
                ],
                page: {
                    title: pageTitle
                }
            }
        }
    }
}

exports.main = main
