module.exports = {

    // Administrators with an email address on this domain are allowed to take over
    // the content of the deleted users. Administrators from other domains
    // (for example a client's own staff) are never used.
    ownerEmailDomain: `example.com`,

    // Created as an administrator on a site that has no eligible administrator.
    // Its email address must be on the domain above.
    fallbackAdminEmail: `devs+wpadmin@example.com`,
    fallbackAdminLogin: `wpadmin`,
}
