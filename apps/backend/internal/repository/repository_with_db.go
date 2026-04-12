package repository

import "gorm.io/gorm"

// NewTicketRepositoryWithDB wires a ticket repository to an explicit DB (tests, alternate boot paths).
func NewTicketRepositoryWithDB(db *gorm.DB) TicketRepository {
	return &ticketRepository{db: db}
}

// NewCounterRepositoryWithDB wires a counter repository to an explicit DB.
func NewCounterRepositoryWithDB(db *gorm.DB) CounterRepository {
	return &counterRepository{db: db}
}

// NewOperatorIntervalRepositoryWithDB wires an operator-interval repository to an explicit DB.
func NewOperatorIntervalRepositoryWithDB(db *gorm.DB) OperatorIntervalRepository {
	return &operatorIntervalRepository{db: db}
}
